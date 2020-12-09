export enum ESERState {
    running,
    finished,
    ready,
    error,
    serNotRunning,
    serNoConnectionQlik,
    noProperties,
    stopping,
    starting,
    errorNoLinkFound,
    errorInsufficentRights
}

export enum ESerResponseStatusSmaler5 {
    serConnectionQlikError = -2,
    serError = -1,
    serReady = 0,
    serRunning = 1,
    serBuildReport = 2,
    serFinished = 3,
    serStopping = 4
}

export enum ESerResponseStatus {
    serError = -1,
    serCreatingReport = 0,
    serRunning = 1,
    serDeleveryReport = 2,
    serFinished = 3,
    serStopping = 4,
    serWarning = 5,
    serVersion = 100
}

export enum EVersionOption {
    all
}

export enum ETaskOption {
    all
}

export enum ESelectionMode {
    sharedSession = 0,
    bookmark = 1,
    notUse = 2
}