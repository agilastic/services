/**
 * A file reported by the file watch binding (complete, i.e. no longer being written)
 */
export interface WatchedFile {
    /** full path */
    filename: string
    /** folder */
    dir: string
    /** name without extension */
    name: string
    /** name with extension */
    base: string
    /** extension without dot, lower case */
    ext: string
    size?: number
}

/**
 * Platform binding that watches a folder for new files (desktop: capability 'fileWatch')
 */
export interface IFileWatchBinding {
    /** starts watching a folder; resolves with the id of the watch, or undefined if not possible */
    watch(dir: string, extensions: Array<string>): Promise<string|undefined>
    unwatch(id: string): Promise<boolean>
    /** registers the callback for new files of all watches */
    onMessage(callback: (id: string, file: WatchedFile) => void): void
}
