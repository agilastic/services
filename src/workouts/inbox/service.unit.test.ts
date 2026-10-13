import { Inject } from '../../base/decorators'
import { WorkoutInboxService } from './service'

describe('WorkoutInboxService', () => {
    let service: WorkoutInboxService
    let settings: Record<string, unknown>
    let fileWatch: { watch: jest.Mock, unwatch: jest.Mock, onMessage: jest.Mock }
    let onFile: (id: string, file: any) => void
    let importMock: jest.Mock

    const file = { filename: '/dl/Sweet Spot.zwo', dir: '/dl', name: 'Sweet Spot', base: 'Sweet Spot.zwo', ext: 'zwo' }

    beforeEach(() => {
        settings = {}
        fileWatch = {
            watch: jest.fn().mockResolvedValue('watch-1'),
            unwatch: jest.fn().mockResolvedValue(true),
            onMessage: jest.fn(cb => { onFile = cb }),
        }
        importMock = jest.fn().mockResolvedValue([{}])
        Inject('Bindings', { fileWatch, appInfo: { getDownloadsDir: () => '/dl' } })
        Inject('UserSettings', { get: jest.fn((k: string, d: unknown) => settings[k] ?? d), set: jest.fn((k: string, v: unknown) => { settings[k] = v }) })
        Inject('WorkoutList', { import: importMock })
        service = new WorkoutInboxService()
    })

    afterEach(() => {
        ;(service as any).reset?.()
        Inject('Bindings', null)
        Inject('UserSettings', null)
        Inject('WorkoutList', null)
        jest.clearAllMocks()
    })

    describe('start', () => {
        test('watches the download folder for .zwo files', async () => {
            expect(await service.start()).toBe(true)
            expect(fileWatch.watch).toHaveBeenCalledWith('/dl', ['zwo'])
        })

        test('does nothing when disabled', async () => {
            settings['preferences.workoutInbox.enabled'] = false

            expect(await service.start()).toBe(false)
            expect(fileWatch.watch).not.toHaveBeenCalled()
        })

        test('does nothing when the platform has no download folder', async () => {
            Inject('Bindings', { fileWatch, appInfo: {} })

            expect(await service.start()).toBe(false)
            expect(service.isSupported()).toBe(false)
        })

        test('starts only once', async () => {
            await service.start()
            await service.start()

            expect(fileWatch.watch).toHaveBeenCalledTimes(1)
        })
    })

    describe('new files', () => {
        test('imports a new workout file and reports it', async () => {
            const imported = jest.fn()
            service.on('imported', imported)
            await service.start()

            onFile('watch-1', file)
            await new Promise(done => setImmediate(done))

            expect(importMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'file', filename: '/dl/Sweet Spot.zwo', ext: 'zwo', name: 'Sweet Spot', delimiter: '/' }), { showImportCards: false })
            expect(imported).toHaveBeenCalledWith({ name: 'Sweet Spot', count: 1 })
        })

        test('reports files that could not be imported', async () => {
            importMock.mockRejectedValue(new Error('invalid workout file'))
            const error = jest.fn()
            service.on('error', error)
            await service.start()

            onFile('watch-1', file)
            await new Promise(done => setImmediate(done))

            expect(error).toHaveBeenCalledWith({ name: 'Sweet Spot', error: 'invalid workout file' })
        })

        test('ignores events of other watches', async () => {
            await service.start()

            onFile('watch-other', file)
            await new Promise(done => setImmediate(done))

            expect(importMock).not.toHaveBeenCalled()
        })
    })

    describe('setEnabled', () => {
        test('switching off stops the watch and stores the setting', async () => {
            await service.start()

            await service.setEnabled(false)

            expect(fileWatch.unwatch).toHaveBeenCalledWith('watch-1')
            expect(settings['preferences.workoutInbox.enabled']).toBe(false)
        })

        test('switching on starts the watch', async () => {
            settings['preferences.workoutInbox.enabled'] = false

            await service.setEnabled(true)

            expect(fileWatch.watch).toHaveBeenCalled()
        })
    })

    test('provides the workout library URL', () => {
        expect(service.getLibraryUrl()).toBe('https://whatsonzwift.com/workouts')
    })

    describe('getStatus', () => {
        test('active while watching', async () => {
            await service.start()
            expect(service.getStatus()).toBe('active')
        })

        test('no-access when the folder can not be watched', async () => {
            fileWatch.watch.mockResolvedValue(undefined)
            const onStatus = jest.fn()
            service.on('status', onStatus)

            await service.start()

            expect(service.getStatus()).toBe('no-access')
            expect(onStatus).toHaveBeenCalledWith('no-access')
        })

        test('off after switching off', async () => {
            await service.start()
            await service.setEnabled(false)
            expect(service.getStatus()).toBe('off')
        })
    })
})
