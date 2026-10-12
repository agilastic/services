import { getServerUrl, ServerNotConfiguredError } from './index'

describe('getServerUrl', () => {
    const settingsGetter = (values: Record<string, unknown>) => (key: string, def: unknown) => values[key] ?? def

    test('returns undefined when nothing is configured', () => {
        expect(getServerUrl(settingsGetter({}), 'ROUTE_API', 'dlws', '/api/v1/routes')).toBeUndefined()
    })

    test('derives the URL from DOMAIN', () => {
        const get = settingsGetter({ DOMAIN: 'example.com' })

        expect(getServerUrl(get, 'ROUTE_API', 'dlws', '/api/v1/routes')).toBe('https://dlws.example.com/api/v1/routes')
    })

    test('uses the domain itself for an empty subdomain', () => {
        expect(getServerUrl(settingsGetter({ DOMAIN: 'example.com' }), undefined, '')).toBe('https://example.com')
    })

    test('prefers the explicitly configured URL', () => {
        const get = settingsGetter({ DOMAIN: 'example.com', ROUTE_API: 'https://routes.example.org/v1' })

        expect(getServerUrl(get, 'ROUTE_API', 'dlws', '/api/v1/routes')).toBe('https://routes.example.org/v1')
    })

    test('treats empty values as not configured', () => {
        expect(getServerUrl(settingsGetter({ DOMAIN: ' ', ROUTE_API: '' }), 'ROUTE_API', 'dlws')).toBeUndefined()
    })
})

describe('ServerNotConfiguredError', () => {
    test('names the missing server', () => {
        const err = new ServerNotConfiguredError('route')

        expect(err.message).toBe('route server not configured')
        expect(err.name).toBe('ServerNotConfiguredError')
    })
})
