import { ActivityDetails } from "../model";
import { ActivityConverterFactory } from "./factory";
import { LocalFitConverter } from "./fit";
import { TcxConverter } from "./tcx";
import { GpxConverter } from "./gpx";

// lazy initialisation of converters

export class ActivityConverter {
    protected static factory?: ActivityConverterFactory


    static async convert (activity:ActivityDetails,format:string) : Promise<unknown> {

        if (!ActivityConverter.factory) {
            ActivityConverter.factory = new ActivityConverterFactory()
            ActivityConverter.factory.add('fit',new LocalFitConverter())
            ActivityConverter.factory.add('tcx', new TcxConverter())
            ActivityConverter.factory.add('gpx', new GpxConverter())
        }

        return await ActivityConverter.factory.convert(activity,format)
    }

    // used for testing only
    static _reset():void {
        ActivityConverter.factory = undefined
    }
    
}
