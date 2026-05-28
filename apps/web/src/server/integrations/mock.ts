import type { ExternalIssueProvider, TaskStatus } from "./types";

export type MockIssueConfig = {
  enabled?: boolean;
  baseUrl?: string;
  reportState?: string;
  stateMap?: Partial<Record<TaskStatus, string>>;
};

const DEFAULT_STATE_MAP: Record<TaskStatus, string> = {
  queued: "Open",
  picked: "In Progress",
  in_progress: "In Progress",
  pr_open: "Review",
  done: "Done",
  wont_do: "Closed",
};

export const MOCK_PROVIDER_ID = "mock" as const;

export const mockIssueProvider: ExternalIssueProvider<MockIssueConfig, string> = {
  id: MOCK_PROVIDER_ID,
  name: "Mock Issues",
  issueLabel: "mock issue",

  isConfigured(config) {
    return config?.enabled === true;
  },

  issueUrl(config, issueId) {
    return `${(config.baseUrl || "https://mock.quad.local").replace(/\/$/, "")}/issues/${issueId}`;
  },

  reportState(config) {
    return config?.reportState?.trim() || "Open";
  },

  mapTaskStatus(config, status) {
    return config?.stateMap?.[status] || DEFAULT_STATE_MAP[status] || null;
  },

  async getIssue({ config, issueId }) {
    if (!issueId || !config) return null;
    return {
      id: issueId,
      url: this.issueUrl(config, issueId),
      title: `Mock issue #${issueId}`,
      state: "Open",
    };
  },

  async testConnection() {
    return { ok: true, message: "Mock provider is available" };
  },

  async setIssueState({ state }) {
    return state || null;
  },

  async updateIssueForTaskStatus({ config, status }) {
    return this.mapTaskStatus(config, status);
  },

  async addIssueComment() {
    return;
  },
};
