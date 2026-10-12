import { AxiosInstance } from "axios";
import { FitExportActivity } from "../../model";
import { useUserSettings } from "../../../../settings";
import { FITCONVERT_API } from "./consts";
import { trimTrailingChars } from "../../../../utils";
import { IncyclistRestApiClient, getServerUrl, ServerNotConfiguredError } from "../../../../api";
import { Injectable } from "../../../../base/decorators";

export class IncyclistFitConvertApi { 

    protected api: AxiosInstance

    async convertToFit(data:FitExportActivity):Promise<ArrayBuffer>{
        let url
        try {
            const baseUrl = this.getBaseUrl()
            if (!baseUrl)
                throw new ServerNotConfiguredError('FIT conversion')
            const requestUrl = `${baseUrl}/activity/${data.id}`
            const response = await this.getApi().post( requestUrl,data);
            url = response.data;            
        }
        catch (error) {
            throw new Error(`convert failed: (phase convert), reason: ${error.message}`, { cause: error });
        }

        // download result
        try {
            const response = await this.getApi().get(url,{responseType: 'arraybuffer'})            
            return response.data
        }
        
        catch (error) {
            throw new Error(`convert failed: (phase download), reason: ${error.message}`, { cause: error });
        }
    }

    // istanbul ignore next
    protected getApi():AxiosInstance {
        if (!this.api) {
            this.api = IncyclistRestApiClient.getClient()
            return this.api
        }
        return this.api
    }

    protected getBaseUrl():string|undefined {        
        let baseUrl:string|undefined
        try {
            const settings = this.getUserSettings()
            baseUrl = getServerUrl(settings.get.bind(settings), FITCONVERT_API, 'dlws', '/api/v1/fit/convert')
        }
        catch {
            baseUrl = undefined
        }
        return baseUrl ? trimTrailingChars(baseUrl,'/') : undefined
    }

    @Injectable
    getUserSettings() {
        return useUserSettings()
    }
    


}