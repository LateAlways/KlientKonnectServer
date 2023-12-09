export const Logger = {
    log: (type: string, ...messages: string[]) => {
        console.log("[LOG - "+type+"]", messages.join(" "));
    },
    warn: (type: string, ...messages: string[]) => {
        console.warn("[WARN - "+type+"]", messages.join(" "));
    },
    error: (type: string, ...messages: string[]) => {
        console.error("[ERROR - "+type+"]", messages.join(" "));
    }
}