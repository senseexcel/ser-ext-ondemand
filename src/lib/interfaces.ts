//#region imports
import { logging }                      from "../node_modules/davinci.js/dist/umd/daVinci";

import { ISerConfig,
         ISerReport}                    from "../node_modules/ser.api/index";
import { EVersionOption,
         ETaskOption,
         ESerResponseStatus }                  from "./enums";
//#endregion

export interface ISERRequestStart extends ISerConfig {
}

export interface ISerReportExtended extends ISerReport {
    distribute: ISERDistribute;
}

export interface ISERResponseStart {
    status: number;
    taskId: string;
}

export interface ISERResponseStatusVersion {
    name: string;
    version: string;
}

export interface ISERResponseStatus {
    status: ESerResponseStatus;
    log: string;
    taskId: string;
    versions: ISERResponseStatusVersion[];
    distribute: string
}

export interface IDistribute {
    hubResults: IHubResult[];
}

export interface IHubResult {
    link: string;
    success: boolean;
    message: string;
    reportName: string;
}

export interface ISERRequestStatus {
    taskId?: string;
    versions?: EVersionOption | string;
    tasks?: ETaskOption | string;
}

export interface ISERDistribute {
    hub: ISERHub;
}

export interface ISERHub {
    mode: string;
    connections: string;
}

export interface ILayout {
    properties: IProperties;
}

export interface IProperties {
    template: string;
    output: string;
    selection: number;
    directDownload: boolean;
    templateContentLibrary?: number;
    loglevel?: logging.LogLevel;
}

export interface INxAppPropertiesExtended extends EngineAPI.INxAppProperties {
    published: boolean;
}

export interface IGenericBookmarkLayoutMetaExtended extends EngineAPI.INxMetaTitleDescription {
    published: boolean;
    privileges: string[];
    approved: boolean;
    title: string;
    tags: string[];
}

export interface IGenericBookmarkExtended extends EngineAPI.IGenericBookmark {
    id: string;
}



export interface IDataLabel {
    label: string;
    value: string | number;
}

export interface ILibrary extends IDataLabel {
    content?: IDataLabel[];
}
