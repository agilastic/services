import {EventLogger} from 'gd-eventlog'
import { RouteApiDescription, RouteApiDetail, RouteDescriptionQuery, RouteServer } from "./types";
import { AxiosInstance, AxiosRequestConfig } from "axios";
import { NO_CACHE, ROUTE_API, ROUTE_SERVERS } from './consts'
import { IncyclistRestApiClient, getServerUrl, ServerNotConfiguredError } from '../../../api';
import { useUserSettings } from '../../../settings';
import { RoutePoint } from '../types';
import { Injectable } from '../../../base/decorators';
import { LatLng } from '../../../utils/geo';

export default class IncyclistRoutesApi { 

    protected static _instance

    static getInstance():IncyclistRoutesApi{        
        IncyclistRoutesApi._instance = IncyclistRoutesApi._instance ??new IncyclistRoutesApi()        
        return IncyclistRoutesApi._instance
    }

    protected logger: EventLogger
    protected api: AxiosInstance

    constructor() {
        this.logger = new EventLogger('RouteListApi')
    }

    protected logError( err:Error, fn:string, logInfo?) {
        const args = logInfo ?? {}
        this.logger.logEvent( {message:'Error', error:err.message, fn, ...args})
    }

    protected getApi():AxiosInstance {
        if (!this.api) {
            this.api = IncyclistRestApiClient.getClient()
            return this.api
        }
        return this.api
    }


     protected getBaseUrl():string|undefined {
        return getServerUrl(this.getSetting.bind(this), ROUTE_API, 'dlws', '/api/v1/routes')
    }

    /**
     * Provides the route servers to be queried
     *
     * These are the enabled entries of the `ROUTE_SERVERS` setting. Without this setting, the single
     * route server configured via `ROUTE_API` (or derived from `DOMAIN`) is used, as before.
     *
     * @returns the enabled route servers (empty if none is configured)
     */
    getRouteServers():Array<RouteServer> {
        const configured = this.getSetting(ROUTE_SERVERS, undefined)
        if (Array.isArray(configured)) {
            return configured
                .filter( (s:RouteServer) => typeof s?.url==='string' && s.url.trim().length>0 && s.enabled!==false )
                .map( (s:RouteServer,idx:number) => ({...s, id: s.id ?? `server-${idx}`, url: s.url.trim().replace(/\/+$/,'') }) )
        }

        const url = this.getBaseUrl()
        return url ? [{ id:'default', url }] : []
    }

    /**
     * Loads the route descriptions from a route server
     *
     * @param query    type (gpx|video) and optional category
     * @param throws   throw errors instead of returning undefined
     * @param server   base URL of the route server (default: the single configured route server)
     */
    async getRouteDescriptions(query:RouteDescriptionQuery, throws:boolean = false, server?:string): Promise<Array<RouteApiDescription>> {
        const {type='gpx',category} = query;

        let url  = (type === 'gpx' ) ? `?private=false` : `/?type=${type}`;
        if (category)
            url += "&category=${category}"

        try {
            const res = await this._get( url, NO_CACHE, server )       
            return res.data;           
        }
        catch(err) {
            if (throws)
                throw(err)

            this.logError(err,'getRouteDescriptions', {query})
            return undefined
        }
    }

    static verify(route) {
        if (route['decoded'] ) {
            route.points =route['decoded']
            delete route['decoded']

            IncyclistRoutesApi.fixMissingRouteDistances(route.points)
        }

    }

    protected static fixMissingRouteDistances(points:Array<RoutePoint>) {
        let routeDistance = 0
        points.forEach( (p)=> {
            if (!p.routeDistance)
                p.routeDistance = routeDistance
            routeDistance = p.routeDistance+p['distance']
        })

    }

    /**
     * Loads the details of a route
     *
     * @param routeId  id of the route
     * @param server   base URL of the route server the route was loaded from (default: the single configured route server)
     */
    async getRouteDetails( routeId: string, server?:string): Promise<RouteApiDetail> {

        try {
            const res = await this._get( `/${routeId}`, undefined, server )  
            IncyclistRoutesApi.verify(res.data)
            return res.data;           
        }
        catch {
            return undefined
        }
    }

    async getRoutePreview( routeId: string): Promise<string> {

        try {
            const res = await this._get( `/${routeId}/preview` )              
            return res.data?.url;           
        }
        catch {
            return undefined
        }
    }

    async getCountry(query:LatLng|Array<LatLng>):Promise<string|undefined> {

        if (!query)
            return

        let url;
        if (Array.isArray(query)) {
            const points = query.slice(0,100).map( (p:LatLng) => `${p.lat},${p.lng}` ).join(';')
            url = `/country?points=${points}`
        }
        else {
            const {lat,lng} = query            
            url = `/country?lat=${lat}&lng=${lng}`
        }

        
        try {

            const conf: AxiosRequestConfig = {};
            conf.validateStatus = (status: number) => {
                return (status >= 200 && status < 300) || status == 404 || status==429
            }

            const res = await this._get(url,conf ) 
            if (res.status===404)
                return;
            if (res.status===429) {
                this.logger.logEvent({message:'getCountry hit rate limit',query})
                return;
            }
            
            return res.data.country?.toUpperCase()
        }
        catch(err) {
            this.logError(err,'getCountry')
        }

    }



    async reload():Promise<void> {
        try {
            await this._get( `/reload` )                   
        }
        catch(err) {
            this.logError(err,'reload')
        }

    }

    protected async _get(url:string, config?:AxiosRequestConfig, server?:string) {
        const api = this.getApi()
        const baseUrl = server ?? this.getBaseUrl()
        if (!baseUrl)
            throw new ServerNotConfiguredError('route')
        
        return await api.get( baseUrl+url, config )       
    }

    // only to be used by unit tests
    protected _reset() {
        IncyclistRoutesApi._instance = undefined
    }

    protected getSetting(key:string, def:any) {
        try {
            return this.getUserSettings().get(key, def)
        }
        catch {
            return def
        }
    }



    @Injectable
    getUserSettings() {
        return useUserSettings()
    }


}




