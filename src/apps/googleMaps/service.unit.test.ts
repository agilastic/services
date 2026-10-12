import { Inject } from '../../base/decorators'
import { GoogleMapsService } from './service'

describe('GoogleMapsService', () => {

    describe('getMapsDownloadUrl', () => {
        let service: GoogleMapsService

        const injectSettings = (values: Record<string, unknown>) => {
            const get = jest.fn((key: string, def: unknown) => values[key] ?? def)
            Inject('UserSettings', { get, getValue: get })
        }

        beforeEach(() => {
            service = new GoogleMapsService()
        })

        afterEach(() => {
            Inject('UserSettings', null)
            jest.clearAllMocks()
        })

        test('no server and no personal key: maps cannot be loaded', () => {
            injectSettings({})

            expect(service.getMapsDownloadUrl()).toBeUndefined()
        })

        test('personal key without server: loads directly from Google', () => {
            injectSettings({ GOOGLE_MAPS_API_KEY: 'my-key' })

            expect(service.getMapsDownloadUrl()).toBe('https://maps.googleapis.com/maps/api/js')
        })

        test('uses the maps proxy of the configured domain', () => {
            injectSettings({ DOMAIN: 'example.com' })

            expect(service.getMapsDownloadUrl()).toBe('https://updates.example.com/api/v1/maps')
        })

        test('prefers an explicitly configured MAPS_API_URL', () => {
            injectSettings({ DOMAIN: 'example.com', MAPS_API_URL: 'https://maps.example.org/js' })

            expect(service.getMapsDownloadUrl()).toBe('https://maps.example.org/js')
        })
    })
})
