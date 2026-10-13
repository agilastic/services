import { getBindings } from '../../api'
import type { FileInfo } from '../../api'
import type { WatchedFile } from '../../api/fileWatch/types'
import { Injectable } from '../../base/decorators'
import { IncyclistService } from '../../base/service'
import { Singleton } from '../../base/types'
import { useUserSettings } from '../../settings'
import { useWorkoutList } from '../list'
import type { WorkoutInboxImport } from './types'

/** user setting: automatically import workouts downloaded into the download folder */
export const WORKOUT_INBOX_SETTING = 'preferences.workoutInbox.enabled'
export const WORKOUT_INBOX_EXTENSIONS = ['zwo']
/** workout library the user can download workouts from (manually, in the browser) */
export const WORKOUT_LIBRARY_URL = 'https://whatsonzwift.com/workouts'

/**
 * Workout Inbox
 *
 * Watches the user's download folder and imports every new workout file (.zwo) automatically -
 * e.g. workouts the user downloads from a workout library in the browser. Only files that are
 * downloaded while the app is running are imported; files that already exist are not touched.
 *
 * @emits imported  {@link WorkoutInboxImport} - a downloaded file was imported
 * @emits error     {@link WorkoutInboxError}  - a downloaded file could not be imported
 */
@Singleton
export class WorkoutInboxService extends IncyclistService {
    protected watchId?: string
    protected listening = false

    constructor() {
        super('WorkoutInbox')
    }

    /**
     * Starts watching the download folder (if enabled and supported by the platform)
     *
     * @returns true if the inbox is active
     */
    async start(): Promise<boolean> {
        try {
            if (this.watchId)
                return true
            if (!this.isEnabled())
                return false

            const binding = this.getBindings()?.fileWatch
            const dir = this.getBindings()?.appInfo?.getDownloadsDir?.()
            if (!binding || !dir)
                return false

            if (!this.listening) {
                binding.onMessage((id, file) => {
                    if (id === this.watchId)
                        this.onFile(file)
                })
                this.listening = true
            }

            this.watchId = await binding.watch(dir, WORKOUT_INBOX_EXTENSIONS)
            this.logEvent({ message: 'workout inbox started', active: !!this.watchId })
            return !!this.watchId
        }
        catch (err) {
            this.logError(err as Error, 'start')
            return false
        }
    }

    /**
     * Stops watching the download folder
     */
    async stop(): Promise<void> {
        try {
            const id = this.watchId
            delete this.watchId
            if (id)
                await this.getBindings()?.fileWatch?.unwatch(id)
        }
        catch (err) {
            this.logError(err as Error, 'stop')
        }
    }

    /**
     * Indicates whether the platform supports the workout inbox (file watch + download folder)
     */
    isSupported(): boolean {
        const bindings = this.getBindings()
        return !!bindings?.fileWatch && !!bindings?.appInfo?.getDownloadsDir?.()
    }

    /**
     * Provides the URL of a workout library the user can download workouts from
     */
    getLibraryUrl(): string {
        return WORKOUT_LIBRARY_URL
    }

    /**
     * Indicates whether the workout inbox is enabled (default: true)
     */
    isEnabled(): boolean {
        try {
            return this.getUserSettings().get(WORKOUT_INBOX_SETTING, true) !== false
        }
        catch {
            return true
        }
    }

    /**
     * Enables/disables the workout inbox and starts/stops it accordingly
     *
     * @param enabled new state
     */
    async setEnabled(enabled: boolean): Promise<void> {
        this.getUserSettings().set(WORKOUT_INBOX_SETTING, enabled)
        if (enabled)
            await this.start()
        else
            await this.stop()
    }

    protected async onFile(file: WatchedFile): Promise<void> {
        const info: FileInfo = {
            type: 'file',
            name: file.name,
            base: file.base,
            filename: file.filename,
            dir: file.dir,
            ext: file.ext,
            delimiter: file.filename?.includes('\\') ? '\\' : '/',
        }
        try {
            const cards = await this.getWorkoutList().import(info, { showImportCards: false })
            const imported: WorkoutInboxImport = { name: file.name, count: cards?.length ?? 0 }
            this.logEvent({ message: 'workout imported from download folder', count: imported.count })
            this.emit('imported', imported)
        }
        catch (err) {
            this.logError(err as Error, 'onFile')
            this.emit('error', { name: file.name, error: (err as Error).message })
        }
    }

    @Injectable
    protected getBindings() {
        return getBindings()
    }

    @Injectable
    protected getUserSettings() {
        return useUserSettings()
    }

    @Injectable
    protected getWorkoutList() {
        return useWorkoutList()
    }
}

/**
 * Provides the Workout Inbox service
 */
export const useWorkoutInbox = () => new WorkoutInboxService()
