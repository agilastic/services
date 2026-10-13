
export type OSInfo = {
    platform: string
    arch: string
    release:string
}


export type AppChannel = 'desktop' | 'mobile' | 'web' | 'tv' | 'backend'


export interface IAppInfo {
    getOS():OSInfo
    getAppVersion():string
    getUIVersion():string
    getAppDir():string
    getSourceDir():string
    getTempDir():string
    /** user's download folder (e.g. ~/Downloads), if the platform provides it */
    getDownloadsDir?():string|undefined
    isApp():boolean
    getChannel():AppChannel
    session:string
}