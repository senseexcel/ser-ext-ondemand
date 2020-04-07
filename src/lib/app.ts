export class AppObject {

    private app: EngineAPI.IApp;

    public appId: string;
    public appIsPublic: boolean;

    constructor(app: EngineAPI.IApp) {
        this.app = app;
        this.getAppId();
    }

    public async getUsername(): Promise<string> {
        let res = await this.app.evaluateEx("=OSUser()");
        let uArr = res.qText.split(";");
        return `${uArr[0].split("=")[1]}/${uArr[1].split("=")[1]}`;
    }

    public async getAppId(): Promise<string> {
        const appLayout = await this.app.getAppLayout()
        this.appId = appLayout.qFileName;
        return appLayout.qFileName;
    }

}