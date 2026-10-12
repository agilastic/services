import { getBindings, getServerUrl } from "../../api";
import { Injectable } from "../../base/decorators";
import { IncyclistService } from "../../base/service";
import { Singleton } from "../../base/types";
import { useUserSettings } from "../../settings";

const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com/maps/api/js'


@Singleton
export class GoogleMapsService extends IncyclistService {

    api: any // representation of the Google Maps API


    constructor() {
        super('GoogleMaps')
    }


    setApi(api): void {     
        this.api = api
        this.emit('loaded')
    }

    getApi(): any {
        return this.api
    }

    async waitForApiKey():Promise<boolean> {
        if (this.api)
            return true
    }

    async getApiKey(): Promise<string> {
        const settings = this.getUserSettings()


        const personalKey = settings.getValue('GOOGLE_MAPS_API_KEY',undefined)
        const developmentMode = settings.get('mode', 'production')==='development';

        if (developmentMode)
             return personalKey??'development'


        return personalKey //?? appKey
    }

    hasPersonalApiKey() {
        const settings = this.getUserSettings()

        const personalKey = settings.get('GOOGLE_MAPS_API_KEY',undefined)
        return personalKey!==undefined
    }

    onPersonalApiKeySet() {
        this.emit('reload')
    }
    hasDevelopmentApiKey() {
        const settings = this.getUserSettings()
        return settings.get('mode', 'production')==='development';        
    }

    /**
     * Provides the URL the Google Maps API script is loaded from
     *
     * Order: explicit `MAPS_API_URL` setting, the maps proxy on the configured update server (`DOMAIN`),
     * or - when the user has a personal API key - Google directly
     *
     * @returns the URL, or `undefined` if Google Maps cannot be loaded
     */
    getMapsDownloadUrl ():string|undefined {
        const settings = this.getUserSettings()
        const url = getServerUrl(settings.getValue.bind(settings), 'MAPS_API_URL', 'updates', '/api/v1/maps')
        if (url)
            return url
        return this.hasPersonalApiKey() ? GOOGLE_MAPS_API_URL : undefined
    }

    reload() {
        if (!this.api) {
            this.emit('reload')
        }
    }

    protected getSecret(key:string):string {
        return this.getSecretBindings()?.getSecret(key)
    }

    @Injectable
    // istanbul ignore next
    protected getSecretBindings() {
        return getBindings()?.secret
    }

    @Injectable
    protected getUserSettings() {
        return useUserSettings()
    }


}

export const useGoogleMaps = ()=> new GoogleMapsService()
