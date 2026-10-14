import IncyclistRoutesApi from '../../base/api'
import { Route } from '../../base/model/route'
import {RoutesApiLoader}  from './api'
import { RouteListService } from '../service'
import { waitNextTick } from '../../../utils'
import gpx from '../../../../__tests__/data/db/routes.json'
import videos from '../../../../__tests__/data/db/videos.json'

import valdrome from '../../../../__tests__/data/rlv/valdrome.json'
import { RouteApiDescription } from '../../base/api/types'


const DEFAULT_ROUTE_API = 'https://dlws.incyclist.com/api/v1/routes'

describe('RoutesApiLoader',()=>{

    describe('load',()=>{

        let api,service

        beforeEach( ()=>{
            service = new RoutesApiLoader()
            //capi = Route.prototype.updateCountryFromPoints
            service.verifyCountry = jest.fn()
            service.save = jest.fn().mockResolvedValue(undefined)

            mockRouteList()

        })
        afterEach( ()=>{
            api._reset()
            //Route.prototype.updateCountryFromPoints = capi

        })

        const run = ():Promise<{added,updated,routes}>=>new Promise( done =>{
                
            let added = 0;
            let updated = 0;
            const routes:Array<Route> = []

            const observer = service.load()

            observer.on( 'route.added', route=>{
                routes.push(route)
                //console.log('added '+route.description.title)
                added++;
            })
            observer.on( 'route.updated', route=>{
                const existingIdx = routes.findIndex( r=>r.description.id===route.description.id)
                if (existingIdx!==-1)
                    routes[existingIdx]=route
                else 
                routes.push(route)
                updated++;
                //console.log('updated '+route.description.title)
            })
            observer.on('done' ,async ()=>{
                observer.stop({immediately:true})
                await waitNextTick()        

                done({added,updated,routes})
            })
            
        })

        const setupApiMock = ( props:{gpx?, videos?, details?,fn?}) =>{           
            api = IncyclistRoutesApi.getInstance() 
            api.getRouteDescriptions = jest.fn( async (q) => {return ( q.type==='gpx' ? props.gpx??gpx: props.videos??videos) as RouteApiDescription[]})
            api.getRouteDetails = jest.fn( async id => props.details? props.details[id] : props.fn(id)??undefined)
            
            api.getBaseUrl = jest.fn().mockReturnValue(DEFAULT_ROUTE_API)
            return api
        }

        const mockRouteList = () => {
            const list = new RouteListService()
            list.createPreview = jest.fn().mockResolvedValue(true)
            return list

        }



        describe('multiple route servers',()=>{
            const A = { id:'a', name:'Server A', url:'https://a.example.com/routes' }
            const B = { id:'b', name:'Server B', url:'https://b.example.com/routes' }
            const route = (id:string, extra={}) => ({ id, title:`Route ${id}`, version:1, video:{url:`https://x/${id}.mp4`}, ...extra }) as RouteApiDescription

            let processed:Array<RouteApiDescription>

            const setupServers = (lists:Record<string,Array<RouteApiDescription>|Error>) => {
                api = IncyclistRoutesApi.getInstance()
                api.getRouteServers = jest.fn().mockReturnValue([A,B])
                api.getRouteDescriptions = jest.fn( async (q, _throws, server) => {
                    if (q.type==='gpx') return []
                    const res = lists[server]
                    if (res instanceof Error) throw res
                    return res ?? []
                })
                processed = []
                service.processRouteFromApi = jest.fn( async (descr) => { processed.push(descr) })
                service.loadDetails = jest.fn()
            }

            test('loads the routes of all servers and remembers their server',async ()=>{
                setupServers({ [A.url]:[route('1')], [B.url]:[route('2')] })

                await run()

                expect(processed.map(d=>[d.id,d.routeServer])).toEqual([['1',A.url],['2',B.url]])
            })

            test('uses the server name as provider if the route has none',async ()=>{
                setupServers({ [A.url]:[route('1'), route('2',{provider:{name:'Own'}})], [B.url]:[] })

                await run()

                expect(processed.map(d=>d.provider?.name)).toEqual(['Server A','Own'])
            })

            test('skips a route id that was already loaded from another server',async ()=>{
                setupServers({ [A.url]:[route('1')], [B.url]:[route('1'), route('3')] })

                await run()

                expect(processed.map(d=>[d.id,d.routeServer])).toEqual([['1',A.url],['3',B.url]])
            })

            test('a server that cannot be reached does not affect the others',async ()=>{
                setupServers({ [A.url]:new Error('Network Error'), [B.url]:[route('2')] })

                await run()

                expect(processed.map(d=>d.id)).toEqual(['2'])
            })

            test('loads route details from the route\'s server',async ()=>{
                setupApiMock({fn: ()=>undefined})
                api.getRouteDetails = jest.fn().mockResolvedValue(JSON.parse(JSON.stringify(valdrome)))

                await service.getDetails({ description:{ id:'r1', routeServer:B.url } })

                expect(api.getRouteDetails).toHaveBeenCalledWith('r1', B.url)
            })
        })

        describe('recording date',()=>{
            const descr = { id:'r1', title:'Route 1', version:1, recordedAt:'2026-06-10T13:32:42Z', video:{url:'https://example.com/r1.mp4'} } as RouteApiDescription

            beforeEach( ()=>{
                setupApiMock({fn: ()=>undefined})
            })

            test('is taken over from the API description',()=>{
                const info = service.buildRouteInfo(descr)

                expect(info.recordedAt).toBe('2026-06-10T13:32:42Z')
            })

            test('updates an existing route of the same version that has no recording date yet',async ()=>{
                const existing = { id:'r1', title:'Route 1', version:1, tsImported:1000 }
                service.getDescriptionFromDB = jest.fn().mockReturnValue(existing)
                service.getDetailsFromDB = jest.fn().mockResolvedValue({})
                service.emitAndPrepareLoadDetails = jest.fn()
                const items = []

                await service.processRouteFromApi(descr, items)

                const [description] = service.emitAndPrepareLoadDetails.mock.calls[0]
                expect(description.recordedAt).toBe('2026-06-10T13:32:42Z')
                expect(description.tsImported).toBe(1000)
            })

            test('keeps an existing route of the same version with the same recording date',async ()=>{
                const existing = { id:'r1', title:'Route 1', version:1, recordedAt:'2026-06-10T13:32:42Z' }
                service.getDescriptionFromDB = jest.fn().mockReturnValue(existing)
                service.getDetailsFromDB = jest.fn().mockResolvedValue({})
                service.emitAndPrepareLoadDetails = jest.fn()

                await service.processRouteFromApi(descr, [])

                expect(service.emitAndPrepareLoadDetails).not.toHaveBeenCalled()
            })
        })

        test('initial load',async ()=>{

            setupApiMock({fn: ()=>valdrome})

            const run1 = await run()


            expect(run1.routes.length).toBe(34)
            expect(run1.updated).toBe(34) 
            expect(service.save).toHaveBeenCalledTimes(34)

            
        })


    })

})