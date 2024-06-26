import { SettingsViewpoint } from "d";

export const DEFAULT_SETTINGS: SettingsViewpoint = {
	token: '*****',
	username: '',
	repo_name: '',
	project_name: '',
	email: '',
	auto: false,
	fetch: false,
	branch: 'master',
	notif: true,
}

export const INTERVAL_AFTER_CHANGES = 15

export const LOGGER_FILE = 'logger.log'
export const HISTORY_FILE = 'history.log'
export const POCKET_TOKEN_KEY = 'gitlabtoken'
export const HISTORY_VIEW = 'history'

export const GITLAB_API_URL = 'https://gitlab.com/api/v4'

export const PLUGIN_NAME = 'obsidian-snowflake'