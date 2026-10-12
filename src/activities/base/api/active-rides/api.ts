import { AxiosInstance } from "axios";
import { Singleton } from "../../../../base/types";
import { trimTrailingChars } from "../../../../utils";
import { useUserSettings } from "../../../../settings";
import { Injectable } from "../../../../base/decorators";
import { IncyclistRestApiClient, getServerUrl, ServerNotConfiguredError } from "../../../../api";
import { ActiveRideEntry } from "../../../active-rides/types";
import { ActiveRideQuery } from "./types";


@Singleton
export class IncyclistActiveRidesApi { 
    protected api: AxiosInstance

    async getAll(params?:ActiveRideQuery): Promise<ActiveRideEntry[]> {

        try {
            const baseUrl = this.getConfiguredBaseUrl()
            const apiCall = params? this.getApi().get(`${baseUrl}/`, {params}) : this.getApi().get(`${baseUrl}/`)
            const response =  await apiCall

            if (response.status!==200)
                return []

            return response.data?.activeRides??[]
        }
        catch {
            return []
        }
    }

    async getByRouteHash( hash:string) {
        return this.getAll( {routeHash:hash})
    }

    async getById( id:string):Promise<ActiveRideEntry> {
        try {
            const baseUrl = this.getConfiguredBaseUrl()
            const response =  await this.getApi().get(`${baseUrl}/${id}`)
            if (response.status!==200)
                return null

            return response.data
        }
        catch {
            return null
        }
    }

    async getBySessionId( sessionId:string) {
        const list = await this.getAll( {sessionId})
        return list.filter( e=> e.sessionId===sessionId)
        
    }

    protected getApi():AxiosInstance {
        if (!this.api) {
            this.api = IncyclistRestApiClient.getClient(true)
            return this.api
        }
        return this.api
    }

    protected getBaseUrl():string|undefined {        
        let baseUrl:string|undefined
        try {
            const settings = this.getUserSettings()
            baseUrl = getServerUrl(settings.get.bind(settings), 'ACTIVE_RIDES_API', 'dlws', '/api/v1/active-rides')
        }
        catch {
            baseUrl = undefined
        }

        return baseUrl ? trimTrailingChars(baseUrl,'/') : undefined
    }

    protected getConfiguredBaseUrl():string {
        const baseUrl = this.getBaseUrl()
        if (!baseUrl)
            throw new ServerNotConfiguredError('active rides')
        return baseUrl
    }

    @Injectable
    getUserSettings() {
        return useUserSettings()
    }
    

}