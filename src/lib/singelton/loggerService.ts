import { Logger, ETransportType, ELoglevel } from "../logger/index";

export class LoggerSing extends Logger
{
    private static _instance: LoggerSing;

    public constructor(loglevel)
    {
        super({
            baseComment: "ser-ext-ondemand",
            loglvl: loglevel,
            transports: [
                {
                    showBaseComment: true,
                    showDate: true,
                    showLoglevel: true,
                    type: ETransportType.console
                }
            ]
        })
    }

    public static get Instance()
    {
        return this._instance;
    }
}
