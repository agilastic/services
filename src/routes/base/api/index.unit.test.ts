import { Inject } from '../../../base/decorators'
import IncyclistRoutesApi from './index'

describe('IncyclistRoutesApi', () => {
    let api: IncyclistRoutesApi
    let settings: Record<string, unknown>
    let get: jest.Mock

    beforeEach(() => {
        settings = {}
        Inject('UserSettings', { get: jest.fn((key: string, def: unknown) => settings[key] ?? def) })
        api = IncyclistRoutesApi.getInstance()
        get = jest.fn().mockResolvedValue({ data: [] })
        jest.spyOn(api as any, 'getApi').mockReturnValue({ get })
    })

    afterEach(() => {
        ;(api as any)._reset()
        Inject('UserSettings', null)
        jest.restoreAllMocks()
    })

    describe('getRouteServers', () => {
        test('uses ROUTE_API when no server list is configured', () => {
            settings.ROUTE_API = 'https://a.example.com/api/v1/routes'

            expect(api.getRouteServers()).toEqual([{ id: 'default', url: 'https://a.example.com/api/v1/routes' }])
        })

        test('returns no server when nothing is configured', () => {
            expect(api.getRouteServers()).toEqual([])
        })

        test('returns the enabled, valid servers of ROUTE_SERVERS', () => {
            settings.ROUTE_API = 'https://ignored.example.com'
            settings.ROUTE_SERVERS = [
                { id: 'a', name: 'A', url: 'https://a.example.com/routes/' },
                { id: 'b', name: 'B', url: 'https://b.example.com/routes', enabled: false },
                { name: 'C', url: ' https://c.example.com/routes ' },
                { id: 'd', name: 'D', url: '' },
            ]

            expect(api.getRouteServers()).toEqual([
                { id: 'a', name: 'A', url: 'https://a.example.com/routes' },
                { id: 'server-1', name: 'C', url: 'https://c.example.com/routes' },
            ])
        })
    })

    describe('requests', () => {
        test('loads route descriptions from the given server', async () => {
            await api.getRouteDescriptions({ type: 'video' }, true, 'https://b.example.com/routes')

            expect(get.mock.calls[0][0]).toBe('https://b.example.com/routes/?type=video')
        })

        test('loads route details from the given server', async () => {
            get.mockResolvedValue({ data: { id: 'r1' } })

            await api.getRouteDetails('r1', 'https://b.example.com/routes')

            expect(get.mock.calls[0][0]).toBe('https://b.example.com/routes/r1')
        })

        test('uses the single configured server by default', async () => {
            settings.ROUTE_API = 'https://a.example.com/routes'

            await api.getRouteDetails('r1')

            expect(get.mock.calls[0][0]).toBe('https://a.example.com/routes/r1')
        })
    })
})
