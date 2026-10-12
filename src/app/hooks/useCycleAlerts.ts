"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSensorAlertConditions } from "../lib/alertRules";
import type {
  AlertEvent,
  DataPoint,
  ProductionCycle,
  SensorMetric,
  Zone,
} from "../lib/types";
import { usePersistentState } from "../lib/usePersistentState";

const ALERT_STORAGE_KEY = "broiler-dashboard:v11:current-alerts";
const ALL_ZONES: Zone[] = ["A", "B", "C"];

function createEmptyAlertFlags(): Record<SensorMetric, boolean> {
  return {
    temp: false,
    humidity: false,
    co2: false,
    nh3: false,
    pm25: false,
  };
}

function createAlertFlagsByZone(): Record<
  Zone,
  Record<SensorMetric, boolean>
> {
  return {
    A: createEmptyAlertFlags(),
    B: createEmptyAlertFlags(),
    C: createEmptyAlertFlags(),
  };
}

function dedupeAlertsById(alerts: AlertEvent[]) {
  const seenIds = new Set<string>();

  return alerts.filter((alert) => {
    if (seenIds.has(alert.id)) return false;
    seenIds.add(alert.id);
    return true;
  });
}

type UseCycleAlertsInput = {
  activeZones: Zone[];
  cyclesByZone: Record<Zone, ProductionCycle>;
  liveZoneData: Record<Zone, DataPoint> | null;
  selectedZone: Zone | "ALL";
};

export function useCycleAlerts({
  activeZones,
  cyclesByZone,
  liveZoneData,
  selectedZone,
}: UseCycleAlertsInput) {
  const [alerts, setAlerts] = usePersistentState<AlertEvent[]>(
    ALERT_STORAGE_KEY,
    () => []
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [latestToast, setLatestToast] = useState<AlertEvent | null>(null);
  const alertFlagsRef = useRef(createAlertFlagsByZone());

  const cycleAlerts = useMemo(
    () =>
      dedupeAlertsById(
        alerts.filter(
          (entry) => entry.cycleId === cyclesByZone[entry.zone].id
        )
      ),
    [alerts, cyclesByZone]
  );

  const visibleAlerts = useMemo(
    () =>
      selectedZone === "ALL"
        ? cycleAlerts
        : cycleAlerts.filter((entry) => entry.zone === selectedZone),
    [cycleAlerts, selectedZone]
  );

  useEffect(() => {
    if (!liveZoneData) return;

    const nextFlags = Object.fromEntries(
      ALL_ZONES.map((zone) => [zone, { ...alertFlagsRef.current[zone] }])
    ) as Record<Zone, Record<SensorMetric, boolean>>;
    const newAlerts: AlertEvent[] = [];
    const resolvedConditions: Array<{ zone: Zone; metric: SensorMetric }> = [];

    activeZones.forEach((zone) => {
      const zoneCycle = cyclesByZone[zone];
      if (zoneCycle.status !== "active") return;

      const point = liveZoneData[zone];
      getSensorAlertConditions(point).forEach((condition) => {
        const isAbove = condition.value >= condition.threshold;
        const wasAbove = alertFlagsRef.current[zone][condition.metric];

        if (isAbove && !wasAbove) {
          newAlerts.push({
            id: `${zoneCycle.id}-${zone}-${condition.metric}-${point.ts}`,
            cycleId: zoneCycle.id,
            zone,
            metric: condition.metric,
            label: condition.label,
            timestamp: point.time,
            value: condition.value,
            threshold: condition.threshold,
            unit: condition.unit,
            severity:
              condition.value >= condition.criticalThreshold
                ? "critical"
                : "warning",
            status: "active",
            message: `Zone ${zone}: ${condition.label} crossed its configured limit. ${condition.action}`,
          });
        }

        if (!isAbove && wasAbove) {
          resolvedConditions.push({ zone, metric: condition.metric });
        }
        nextFlags[zone][condition.metric] = isAbove;
      });
    });

    alertFlagsRef.current = nextFlags;
    const existingAlertIds = new Set(alerts.map((alert) => alert.id));
    const uniqueNewAlerts = newAlerts.filter(
      (alert) => !existingAlertIds.has(alert.id)
    );

    if (uniqueNewAlerts.length || resolvedConditions.length) {
      setAlerts((previous) => {
        const resolved = previous.map((alert) => {
          const shouldResolve = resolvedConditions.some(
            ({ zone, metric }) =>
              alert.zone === zone &&
              alert.cycleId === cyclesByZone[zone].id &&
              alert.metric === metric
          );
          return shouldResolve && alert.status !== "resolved"
            ? { ...alert, status: "resolved" as const }
            : alert;
        });
        return dedupeAlertsById([...uniqueNewAlerts, ...resolved]).slice(0, 100);
      });
    }

    if (uniqueNewAlerts.length) {
      setLatestToast(uniqueNewAlerts[0]);
      if (soundEnabled) {
        void new Audio("/sound/alert.mp3").play().catch(() => undefined);
      }
    }
  }, [
    activeZones,
    alerts,
    cyclesByZone,
    liveZoneData,
    setAlerts,
    soundEnabled,
  ]);

  useEffect(() => {
    if (!latestToast) return;
    const timeout = window.setTimeout(() => setLatestToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [latestToast]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => !current);
  }, []);

  const acknowledgeAlert = useCallback(
    (id: string) => {
      setAlerts((previous) =>
        previous.map((alert) =>
          alert.id === id && alert.status === "active"
            ? { ...alert, status: "acknowledged" }
            : alert
        )
      );
    },
    [setAlerts]
  );

  const resetZoneAlerts = useCallback(
    (zone: Zone, cycleId?: string) => {
      if (cycleId) {
        setAlerts((current) =>
          current.filter(
            (entry) => entry.zone !== zone || entry.cycleId !== cycleId
          )
        );
      }
      setLatestToast(null);
      alertFlagsRef.current[zone] = createEmptyAlertFlags();
    },
    [setAlerts]
  );

  return {
    cycleAlerts,
    visibleAlerts,
    latestToast,
    soundEnabled,
    toggleSound,
    acknowledgeAlert,
    resetZoneAlerts,
  };
}
