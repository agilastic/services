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
            service.save = jest.fn()

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