import { IActivityConverter } from '../types'
import { ActivityDetails, ActivityLogRecord } from '../../model'

const escapeXml = (s: string): string =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Converts an activity into GPX 1.1, e.g. for the manual import into Garmin Connect
 *
 * Track points contain position, elevation and time; heart rate and cadence are added as Garmin
 * TrackPointExtension, power as `<power>` extension (as used by Strava and other tools).
 * Log records without position are skipped - an activity without any position can not be
 * converted (e.g. a workout without route).
 *
 * @public
 * @noInheritDoc
 */
export class GpxConverter implements IActivityConverter {

    /**
     * Converts the activity
     *
     * @param activity the activity to convert
     * @returns the GPX document
     * @throws Error if the activity does not contain any position
     */
    async convert(activity: ActivityDetails): Promise<string> {
        const startTime = Date.parse(activity.startTime)
        const points = (activity.logs ?? []).filter(log => isNumber(log.lat) && isNumber(log.lng ?? log.lon))

        if (!points.length)
            throw new Error('activity does not contain any position')

        const title = escapeXml(activity.title ?? 'Incyclist Ride')
        const start = Number.isNaN(startTime) ? undefined : new Date(startTime).toISOString()

        const lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<gpx version="1.1" creator="Incyclist" xmlns="http://www.topografix.com/GPX/1/1"' +
                ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
            '  <metadata>',
            `    <name>${title}</name>`,
            start ? `    <time>${start}</time>` : undefined,
            '  </metadata>',
            '  <trk>',
            `    <name>${title}</name>`,
            '    <type>cycling</type>',
            '    <trkseg>',
            ...points.map(log => this.trackPoint(log, startTime)),
            '    </trkseg>',
            '  </trk>',
            '</gpx>',
            ''
        ]
        return lines.filter(l => l !== undefined).join('\n')
    }

    protected trackPoint(log: ActivityLogRecord, startTime: number): string {
        const lng = log.lng ?? log.lon
        const parts = [`      <trkpt lat="${log.lat}" lon="${lng}">`]

        if (isNumber(log.elevation))
            parts.push(`        <ele>${log.elevation}</ele>`)
        if (!Number.isNaN(startTime) && isNumber(log.time))
            parts.push(`        <time>${new Date(startTime + log.time * 1000).toISOString()}</time>`)

        const extensions = this.extensions(log)
        if (extensions)
            parts.push(extensions)

        parts.push('      </trkpt>')
        return parts.join('\n')
    }

    protected extensions(log: ActivityLogRecord): string | undefined {
        const tpx: Array<string> = []
        if (isNumber(log.heartrate) && log.heartrate > 0)
            tpx.push(`<gpxtpx:hr>${Math.round(log.heartrate)}</gpxtpx:hr>`)
        if (isNumber(log.cadence))
            tpx.push(`<gpxtpx:cad>${Math.round(log.cadence)}</gpxtpx:cad>`)

        const items: Array<string> = []
        if (isNumber(log.power))
            items.push(`<power>${Math.round(log.power)}</power>`)
        if (tpx.length)
            items.push(`<gpxtpx:TrackPointExtension>${tpx.join('')}</gpxtpx:TrackPointExtension>`)

        return items.length ? `        <extensions>${items.join('')}</extensions>` : undefined
    }
}
