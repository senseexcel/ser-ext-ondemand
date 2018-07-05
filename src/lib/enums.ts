export enum ESERState {
    running,
    finished,
    ready,
    error,
    serNotRunning,
    serNoConnectionQlik,
    noProperties
}

export enum EVersionOption {
    all
}

export enum ETaskOption {
    all
}

export enum SelectionMode {
	Normal = 0,
	OnDemandOff = 1,
	OnDemandOn = 2,
}
export enum SelectionType {
	Static = 0,
	Dynamic = 1,
}