export const ROUTE_API = 'ROUTE_API'
/** list of route servers (`Array<RouteServer>`), replaces the single ROUTE_API if set */
export const ROUTE_SERVERS = 'ROUTE_SERVERS'

export const NO_CACHE = {
    headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0',
    },
};
