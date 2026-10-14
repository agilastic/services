import { EventLogger } from "gd-eventlog";
import { Observer, PromiseObserver } from "../../../base/types/observer";
import IncyclistRoutesApi from "../../base/api";
import { RouteApiDescription, RouteApiDetail, RouteServer } from "../../base/api/types";
import { Route } from "../../base/model/route";
import { RouteInfo, RouteType } from "../../base/types";
import { addDetails } from "../../base/utils/route";
import { RoutesDbLoader } from "./db";
import { Loader,LoadDetailsTargets } from "./types";
import { sleep } from "../../../utils/sleep";
import { settleWithLimit } from "../../../utils/settleWithLimit";

const ROUTE_DETAILS_CONCURRENCY = 4

const valid = (v) => (v!==undefined && v!==null)

class ApiError extends Error {
    constructor( error:Error, private readonly _type:string, private readonly _server?:string ) {super(error.message)}
    get type (): string {
        return this._type
    }
    get server (): string|undefined {
        return this._server
    }

}

const ExistingAndNotUpdated = (existing: RouteInfo, descr: RouteInfo) => {
    if (!existing)
        return false

    const {isDeleted=false} = descr
    if (existing.isLocal)
        return true

    // the recording date was added to the API later - take it over without a version change
    if (descr.recordedAt && descr.recordedAt!==existing.recordedAt)
        return false

    return ((existing.version || 0) >= (descr.version || 0))
        && (!isDeleted || (isDeleted && existing.isDownloaded));
}

export class RoutesApiLoader extends Loader<RouteApiDescription> {

    protected api: IncyclistRoutesApi
    protected saveObserver: PromiseObserver<void>
    protected logger: EventLogger

    constructor () {
        super()
        this.api = IncyclistRoutesApi.getInstance()        
        this.logger = new EventLogger('RoutesApi')
    }


    load():Observer {
        // no concurrent loads
        if (this.loadObserver)
            return this.loadObserver

        // query all route servers in parallel (gpx and video lists) - a server that fails does not
        // affect the others. Each route remembers its server, so its details are loaded from there.
        const enrichApi = (v:RouteApiDescription,type:RouteType,server:RouteServer)=> ({
            type, ...v,
            routeServer: server.url,
            provider: v.provider ?? (server.name ? {name:server.name} : undefined)
        })
        const query = (type:RouteType, server:RouteServer) =>
            this.api.getRouteDescriptions({type},true,server.url)
                .then( v=> (v??[]).map(e=>enrichApi(e,type,server)))
                .catch(error => {throw new ApiError(error,type,server.url)})

        const api = this.api.getRouteServers().flatMap( server => [ query('gpx',server), query('video',server) ])

        this.loadObserver = new Observer()

        // When both queries have completed ( either successfully or failed) then process the result
        // but ths method should return immediatly (not waiting for the result of the query)
        Promise.allSettled( api).then (async res => {
            await this.onLoadDone(api,res)
        }).catch( err=>{ this.logger.logEvent({message:'could not process route list load', error:err.message}) });

        return this.loadObserver
        
    }

    private async onLoadDone(api,res) {
        // join lists
        const loadDetailRequired: Array<{route:Route, added:boolean}> = []
        const seen = new Map<string,string>()   // route id -> route server

        // for loop as we have asyncs here
        for ( let i=0; i<res.length;i++) {
            const p = res[i]

            if (p.status!=='fulfilled') {                   
                this.logger.logEvent({message: 'could not load route list',reason:p.reason?.message, type:p.reason?.type, server:p.reason?.server})
                continue;
            }

            for (let j=0;j<p.value.length;j++) {
                const descr = p.value[j]
                if (this.isDuplicate(descr, seen))
                    continue
                await this.processRouteFromApi(descr,loadDetailRequired)
            }
            
        }
        this.loadObserver.emit('loaded')

        if (loadDetailRequired.length>0) {            
            await this.loadDetails(loadDetailRequired,true)
        }

        this.loadObserver.emit('done')

        await sleep(1)        
        this.loadObserver.stop()
        delete this.loadObserver        
        
    }

    // the same route id on two servers: the first server wins (mirrors are not supported yet)
    protected isDuplicate(descr:RouteApiDescription, seen:Map<string,string>):boolean {
        const id = descr.routeId??descr.id
        const server = seen.get(id)
        if (server!==undefined && server!==descr.routeServer) {
            this.logger.logEvent({message:'duplicate route skipped', id, title:descr.title, server:descr.routeServer, usedServer:server})
            return true
        }
        seen.set(id, descr.routeServer)
        return false
    }

    private async processRouteFromApi(descr,items) {
        let description;
        const existing = this.getDescriptionFromDB(descr.routeId??descr.id)

        if (ExistingAndNotUpdated(existing, descr)) {

            const details = await this.getDetailsFromDB(existing.id)
            if (details) {
                return
            }
            description = existing
            this.logger.logEvent({message:'route details missing',id:description.id,title:description.title})                
            
        }
        else {
            description = this.buildRouteInfo(descr)
            if (!description) {
                this.logger.logEvent({message:'invalid route',descr})
                return
            }
                    
            if (!existing) {
                this.logger.logEvent({message:'route added',id:description.id,title:description.title,ts:description.tsImported})
                
                description.tsImported = Date.now()
            }
            else {
                description.tsImported = existing.tsImported
                items.push({route:new Route(description),added:false})
                this.logger.logEvent({message:'route updated',id:description.id,title:description.title,from:existing.version, to:description.version,ts:Date.now(), tsImported:description.tsImported})                
            }
        }


        this.emitAndPrepareLoadDetails(description,items,existing);

    }


    private emitAndPrepareLoadDetails(description: any,items,existing) {
        const route = new Route(description);
        const isComplete = this.isCompleted(route);

        if (isComplete) {
            this.verifyRouteHash(route);
        }

        if (!existing) {
            this.emitRouteAdded(route)
            items.push({route,added:true})
            if (isComplete) {
                this.save(route,false).catch( err=>{ this.logger.logEvent({message:'could not save route', id:route.description.id, error:err.message}) })
            }


        }
        else {
            this.save(route,true).catch( err=>{ this.logger.logEvent({message:'could not save route', id:route.description.id, error:err.message}) })
            if (!isComplete)
                items.push({route,added:false})
        }
    }

    stopLoad() {
        this.loadObserver?.stop()
        delete this.loadObserver
    }

    protected getDescriptionFromDB(id:string) {
        const db = new RoutesDbLoader()
        return db.getDescription(id)

    }
    protected async getDetailsFromDB(id:string):Promise<RouteApiDetail> {

        const db = new RoutesDbLoader()        
        return await db.getDetails(id)

    }

    async save(route:Route,enforcedWriteDetails:boolean=false):Promise<void> {
        const db = new RoutesDbLoader()
        await db.save(route,enforcedWriteDetails)
    }


    protected isCompleted(route:Route):boolean {
        const descr = route.description

        if (descr.hasVideo) {
            return valid(descr.points) && ( valid(descr.videoUrl) || (descr.requiresDownload && valid(descr.downloadUrl)))
        }
        else {
            return valid(descr.points)
        }
    }

    protected isPreviewMissing(route:Route) {
        const descr = route.description
        return descr?.hasVideo && !descr?.previewUrl
    }

    protected async loadDetailsFromRepo( items:LoadDetailsTargets):Promise<LoadDetailsTargets>{
        // all missing should be loaded from server
        const promises = items.map ( i => this.getDetailsFromDB (i.route.description.id).then( details => { addDetails(i.route,details)}) )

        const res = await Promise.allSettled(promises) 

        const {failed} = await this.processLoadDetailsResult(res, items, false);
        return failed
        
    }


    async loadDetails( items:LoadDetailsTargets, enforced:boolean=false) {

        try {
            const isUnique = (v,i,a)=> {
                return a.findIndex( item => item.route.description.id===v.route.description.id)===i
            }
            items = items.filter( (v,i,a)=>isUnique(v,i,a) )
        }
        catch(err) {
            this.logger.logEvent({ message: 'error', fn:'loadDetails#unique',error: err.message, stack: err.stack })
        }
        // first try to load details from repo
        
        const failed = enforced ? items : await this.loadDetailsFromRepo(items)


        // all missing should be loaded from server - bounded, so a fresh catalog does not start
        // every transfer at once
        const res = await settleWithLimit(failed, ROUTE_DETAILS_CONCURRENCY, i => this.getDetails(i.route))

        await this.processLoadDetailsResult(res, items, true);

    }

    private async processLoadDetailsResult(res: PromiseSettledResult<void>[],items: LoadDetailsTargets, save?:boolean):Promise<{success:LoadDetailsTargets,  failed: LoadDetailsTargets}> {
        const success:LoadDetailsTargets = []
        const failed: LoadDetailsTargets = []

        res.forEach((pr, idx) => {
            if (pr.status === 'fulfilled') success.push(items[idx]);
            else failed.push(items[idx]);
        });

        for (const element of success) {
            const item = element
//        success.forEach(item => {
            this.emitRouteEvents(item.added===true,item.route)


            await this.verifyCountry(item.route);
            this.verifyRouteHash(item.route)

            if (save)
                this.save(item.route, true).catch( err=>{ this.logger.logEvent({message:'could not save route', id:item.route?.description?.id, error:err.message}) });

        //});
        }

        return {success,failed}
    }

    protected async getDetails(route:Route):Promise<void> {

        const details = await this.api.getRouteDetails(route.description.legacyId||route.description.id, route.description.routeServer)
        addDetails(route,details)

            
    }

    protected buildRouteInfo( descr:RouteApiDescription, isLocal?:boolean): RouteInfo {
        const { id,routeId,title,localizedTitle,country,distance,elevation, category,provider, video, requiresDownload,points,previewUrl,downloadUrl,routeHash,version,isDeleted,recordedAt,routeServer} = descr
        
        const data:RouteInfo = { title,localizedTitle,country,distance,elevation,provider,category,previewUrl,requiresDownload,downloadUrl,routeHash,version,isDeleted,recordedAt,routeServer}

        data.hasVideo = false;
        data.hasGpx = false;
        data.isLocal = isLocal||false
        data.id = routeId || id
        data.legacyId = routeId? id: undefined


        this.updateRouteCountry(data,{descr})
        this.updateRouteTitle(data,{descr})

        if (points) data.hasGpx = true;

        if (category?.toLowerCase()==='demo') 
            data.isDemo = true;

        if (video) {
            data.hasVideo = true;
            if (video.format) data.videoFormat = video.format
            if (video.url && !data.videoUrl) data.videoUrl = video.url            
        }

        return data;
    }


 
}

