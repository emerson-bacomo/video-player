import { useCallback, useState } from "react";
import { addLogDb, clearLogsDb, getLogsDb } from "@/utils/db";

export interface LogEntry {
    id: number;
    timestamp: number;
    level: "INFO" | "ERROR" | "WARNING";
    action: string;
    message: string;
    details?: string;
}

export const useLogs = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const fetchLogs = useCallback((limit: number = 200) => {
        const results = getLogsDb(limit);
        setLogs(results);
    }, []);

    const addLog = useCallback((level: "INFO" | "ERROR" | "WARNING", action: string, message: string, details?: any) => {
        addLogDb(level, action, message, details);
    }, []);

    const clearLogs = useCallback(() => {
        clearLogsDb();
        setLogs([]);
    }, []);

    return {
        logs,
        fetchLogs,
        addLog,
        clearLogs,
    };
};
