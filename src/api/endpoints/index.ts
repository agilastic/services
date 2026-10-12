import { SettingsGetter } from './types'

const valid = (value: unknown): string | undefined =>
    (typeof value === 'string' && value.trim().length > 0) ? value.trim() : undefined

/**
 * Resolves the URL of a server endpoint from the user settings.
 *
 * An explicitly configured URL (`explicitKey`, e.g. `ROUTE_API`) takes precedence. Otherwise the
 * URL is derived from the `DOMAIN` setting as `https://<subdomain>.<DOMAIN><path>`.
 *
 * There is intentionally no default domain: when neither is configured, `undefined` is returned
 * and the feature using the endpoint is disabled - so the app never contacts the upstream
 * incyclist.com servers on its own.
 *
 * @param get         settings accessor
 * @param explicitKey settings key holding a complete URL for this endpoint (optional)
 * @param subdomain   subdomain used together with `DOMAIN` (empty string: the domain itself)
 * @param path        path appended to the derived URL
 * @returns the endpoint URL, or `undefined` when the endpoint is not configured
 */
export const getServerUrl = (get: SettingsGetter, explicitKey: string | undefined, subdomain: string, path = ''): string | undefined => {
    if (explicitKey) {
        const explicit = valid(get(explicitKey, undefined))
        if (explicit)
            return explicit
    }

    const domain = valid(get('DOMAIN', undefined))
    if (!domain)
        return undefined

    const host = subdomain ? `${subdomain}.${domain}` : domain
    return `https://${host}${path}`
}

/**
 * Error thrown by API clients when the server they need is not configured
 */
export class ServerNotConfiguredError extends Error {
    constructor(service: string) {
        super(`${service} server not configured`)
        this.name = 'ServerNotConfiguredError'
    }
}
