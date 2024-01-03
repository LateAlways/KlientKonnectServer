import { messages } from "../websocket/ws";

export class Screen {
    static screens: Screen[] = [];
    jobid: string;
    position: number = 0;

    static getLowestPosition(): number {
        let lowest = 0;
        if(Screen.screens.length == 0) return messages.length;
        Screen.screens.forEach((screen) => {
            if(screen.position > lowest) lowest = screen.position;
        });
        return lowest;
    }

    static getScreenByJobid(jobid: string): Screen | null {
        let screen = Screen.screens.filter((screen) => { return screen.jobid == jobid; });
        if(screen.length == 0) return null;
        return screen[0];
    }

    constructor(jobid: string) {
        this.jobid = jobid;
    }
}