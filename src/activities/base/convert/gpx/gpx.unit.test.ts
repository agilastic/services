import { ActivityDetails } from '../../model'
import { GpxConverter } from './gpx'

const activity = (logs: Array<Record<string, number>>, extra = {}) => ({
    title: 'RLV Gravel: Benther Berg & <Test>',
    startTime: '2026-05-31T12:00:00.000Z',
    logs,
    ...extra,
}) as unknown as ActivityDetails

describe('GpxConverter', () => {
    const converter = new GpxConverter()

    test('creates a GPX track with position, elevation and time', async () => {
        const gpx = await converter.convert(activity([
            { time: 0, lat: 52.3, lng: 9.6, elevation: 80, speed: 0, power: 0, timeDelta: 0 },
            { time: 10, lat: 52.31, lng: 9.61, elevation: 82, speed: 20, power: 150, timeDelta: 10 },
        ]))

        expect(gpx).toContain('<gpx version="1.1" creator="Incyclist"')
        expect(gpx).toContain('<trkpt lat="52.31" lon="9.61">')
        expect(gpx).toContain('<ele>82</ele>')
        expect(gpx).toContain('<time>2026-05-31T12:00:10.000Z</time>')
        expect(gpx).toContain('<type>cycling</type>')
        expect(gpx.match(/<trkpt /g)).toHaveLength(2)
    })

    test('adds heart rate, cadence and power as extensions', async () => {
        const gpx = await converter.convert(activity([
            { time: 0, lat: 52.3, lng: 9.6, speed: 20, power: 151.6, heartrate: 120.4, cadence: 85, timeDelta: 0 },
        ]))

        expect(gpx).toContain('<extensions><power>152</power><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>')
    })

    test('escapes the title', async () => {
        const gpx = await converter.convert(activity([{ time: 0, lat: 52.3, lng: 9.6, speed: 0, power: 0, timeDelta: 0 }]))

        expect(gpx).toContain('<name>RLV Gravel: Benther Berg &amp; &lt;Test&gt;</name>')
    })

    test('skips log records without position', async () => {
        const gpx = await converter.convert(activity([
            { time: 0, speed: 0, power: 0, timeDelta: 0 },
            { time: 1, lat: 52.3, lng: 9.6, speed: 0, power: 0, timeDelta: 1 },
        ]))

        expect(gpx.match(/<trkpt /g)).toHaveLength(1)
    })

    test('accepts the deprecated lon field', async () => {
        const gpx = await converter.convert(activity([{ time: 0, lat: 52.3, lon: 9.6, speed: 0, power: 0, timeDelta: 0 }]))

        expect(gpx).toContain('<trkpt lat="52.3" lon="9.6">')
    })

    test('fails for an activity without any position', async () => {
        await expect(converter.convert(activity([{ time: 0, speed: 0, power: 100, timeDelta: 0 }])))
            .rejects.toThrow('activity does not contain any position')
    })
})
