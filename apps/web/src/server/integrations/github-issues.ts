import { env } from "~/lib/env";
import type { ExternalIssue, ExternalIssueProvider, TaskStatus } from "./types";

export type GitHubIssuesConfig = {
  enabled?: boolean;
  owner?: string;
  repo?: string;
  reportState?: string;
  stateMap?: Partial<Record<TaskStatus, string>>;
};

export type GitHubIssuesCredentials = string;

export const GITHUB_ISSUES_PROVIDER_ID = "github-issues" as const;

const DEFAULT_STATE_MAP: Record<TaskStatus, string> = {
  to_do: "open",
  in_progress: "open",
  reviewed: "open",
  resolved: "closed",
  published: "closed",
  done: "closed",
  canceled: "closed",
};

export const githubIssuesProvider: ExternalIssueProvider<
  GitHubIssuesConfig,
  GitHubIssuesCredentials
> = {
  id: GITHUB_ISSUES_PROVIDER_ID,
  name: "GitHub Issues",
  issueLabel: "GitHub issue",
  envCredentialName: "GITHUB_TOKEN",

  isConfigured(config, credentials) {
    return !!(
      config?.enabled &&
      config.owner?.trim() &&
      config.repo?.trim() &&
      (credentials || env().GITHUB_TOKEN)
    );
  },

  issueUrl(config, issueId) {
    return `https://github.com/${config.owner}/${config.repo}/issues/${issueId}`;
  },

  reportState(config) {
    return config?.reportState?.trim() || "open";
  },

  mapTaskStatus(config, status) {
    return config?.stateMap?.[status] || DEFAULT_STATE_MAP[status] || null;
  },

  async getIssue({ config, issueId, credentials }) {
    if (!issueId || !this.isConfigured(config, credentials) || !config) return null;
    const json = await githubFetch<GitHubIssue>(config, `issues/${issueId}`, {}, credentials);
    return toExternalIssue(config, json);
  },

  async testConnection({ config, credentials }) {
    if (!this.isConfigured(config, credentials) || !config) {
      throw new Error("GitHub Issues project config or credential is missing");
    }
    await githubFetch(config, "", {}, credentials);
    return { ok: true, message: "GitHub repository and credential are valid" };
  },

  async setIssueState({ config, issueId, state, credentials }) {
    if (!issueId || !state || !this.isConfigured(config, credentials) || !config) return null;
    const normalized = normalizeGitHubState(state);
    await githubFetch(
      config,
      `issues/${issueId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ state: normalized }),
      },
      credentials,
    );
    return normalized;
  },

  async updateIssueForTaskStatus({ config, issueId, status, credentials }) {
    const state = this.mapTaskStatus(config, status);
    return this.setIssueState({ config, issueId, state, credentials });
  },

  async addIssueComment({ config, issueId, markdown, credentials }) {
    if (!issueId || !this.isConfigured(config, credentials) || !config) return;
    await githubFetch(
      config,
      `issues/${issueId}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: markdown }),
      },
      credentials,
    );
  },
};

type GitHubIssue = {
  number: number;
  html_url: string;
  title?: string;
  state?: string;
};

function toExternalIssue(config: GitHubIssuesConfig, issue: GitHubIssue): ExternalIssue {
  return {
    id: issue.number,
    url: issue.html_url || githubIssuesProvider.issueUrl(config, issue.number),
    title: issue.title,
    state: issue.state,
  };
}

function normalizeGitHubState(state: string): "open" | "closed" {
  const value = state.toLowerCase().trim();
  if (["closed", "close", "done", "resolved", "canceled", "won't do"].includes(value)) {
    return "closed";
  }
  return "open";
}

async function githubFetch<T = unknown>(
  config: GitHubIssuesConfig,
  path: string,
  init: RequestInit = {},
  credentials?: GitHubIssuesCredentials | null,
): Promise<T> {
  const token = credentials || env().GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const owner = encodeURIComponent(config.owner ?? "");
  const repo = encodeURIComponent(config.repo ?? "");
  const suffix = path ? `/${path}` : "";
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}${suffix}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub Issues ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
