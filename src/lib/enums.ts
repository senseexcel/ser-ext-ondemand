export enum ESERState {
    running,
    finished,
    ready,
    error,
    serNotRunning,
    serNoConnectionQlik,
    noProperties,
    stopping
}

export enum ESerResponseStatus {
    serConnectionQlikError = -2,
    serError = -1,
    serReady = 0,
    serRunning = 1,
    serBuildReport = 2,
    serFinished = 3,
    serStopping = 4
}

export enum EVersionOption {
    all
}

export enum ETaskOption {
    all
}