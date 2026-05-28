export type TaskStatus = "queued" | "picked" | "in_progress" | "pr_open" | "done" | "wont_do";

export type ExternalIssue = {
  id: number | string;
  url: string;
  title?: string;
  state?: string;
};

export type IssueProviderId = "azure-devops" | (string & {});

export type IssueProviderCall<Config, Credentials> = {
  config: Config | null | undefined;
  issueId: number | string | null | undefined;
  credentials?: Credentials | null;
};

export type IssueProviderCommentCall<Config, Credentials> =
  IssueProviderCall<Config, Credentials> & {
    markdown: string;
  };

export type IssueProviderStateCall<Config, Credentials> =
  IssueProviderCall<Config, Credentials> & {
    state: string | null | undefined;
  };

export type IssueProviderTaskStateCall<Config, Credentials> =
  IssueProviderCall<Config, Credentials> & {
    status: TaskStatus;
  };

export type ExternalIssueProvider<Config = unknown, Credentials = unknown> = {
  id: IssueProviderId;
  name: string;
  issueLabel: string;
  envCredentialName?: string;

  isConfigured(config: Config | null | undefined, credentials?: Credentials | null): boolean;
  issueUrl(config: Config, issueId: number | string): string;
  reportState(config: Config | null | undefined): string | null;
  mapTaskStatus(config: Config | null | undefined, status: TaskStatus): string | null;

  getIssue(input: IssueProviderCall<Config, Credentials>): Promise<ExternalIssue | null>;
  testConnection?(input: {
    config: Config | null | undefined;
    credentials?: Credentials | null;
  }): Promise<{ ok: true; message?: string }>;
  setIssueState(input: IssueProviderStateCall<Config, Credentials>): Promise<string | null>;
  updateIssueForTaskStatus(
    input: IssueProviderTaskStateCall<Config, Credentials>,
  ): Promise<string | null>;
  addIssueComment(input: IssueProviderCommentCall<Config, Credentials>): Promise<void>;
};
