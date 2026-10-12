import {EventLogger} from 'gd-eventlog'
import { AxiosInstance } from "axios";
import { IncyclistRestApiClient, getServerUrl, ServerNotConfiguredError } from '../../../api';
import { useUserSettings } from '../../../settings';
import { Singleton } from '../../../base/types';
import { WORKOUT_API } from './consts';
import { Plan, Workout } from '../model/Workout';
import { Injectable } from '../../../base/decorators';

@Singleton
export class IncyclistWorkoutsApi { 

    protected logger: EventLogger
    protected api: AxiosInstance

    constructor() {
        this.logger = new EventLogger('WorkoutsApi')
    }

    protected logError( err:Error, fn:string, logInfo?) {
        const args = logInfo ?? {}
        this.logger.logEvent( {message:'Error', error:err.message, fn, ...args})
    }

    protected getApi():AxiosInstance {
        if (!this.api) {
            this.api = IncyclistRestApiClient.getClient()
            return this.api
        }
        return this.api
    }


    protected getBaseUrl():string|undefined {
        return getServerUrl(this.getSetting.bind(this), WORKOUT_API, 'dlws', '/api/v1/workouts')
    }


    async getWorkouts():Promise<Array<Workout|Plan>> {
        try {
            const res = await this._get( '/' )              
            return res.data;           
        }
        catch {
            return undefined
        }

    }

    async getWorkout(id:string):Promise<Workout|Plan> {
        try {
            const res = await this._get( `/${id}` )              
            return res.data;           
        }
        catch {
            return undefined
        }
        
    }

    async reload():Promise<void> {
        try {
            await this._get( `/reload` )                   
        }
        catch(err) {
            this.logError(err,'reload')
        }

    }

    protected async _get(url:string, ...args) {
        const api = this.getApi()
        const baseUrl = this.getBaseUrl()
        if (!baseUrl)
            throw new ServerNotConfiguredError('workout')
        const request = baseUrl+url
        console.log(request)

        return await api.get( request, ...args )       
    }

    protected getSetting(key:string, def:any) {
        try {
            return this.getUserSettings().get(key, def)
        }
        catch {
            return def
        }
    }

    @Injectable
    getUserSettings() {
        return useUserSettings()
    }




}




