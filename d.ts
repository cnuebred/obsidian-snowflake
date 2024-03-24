declare module 'obsidian' {
	interface DataAdapter {
		files: any,
		basePath: string
	}
}

export interface OptionalGeneralModalConfig {
	options?: string[]
	placeholder?: string
	allowEmpty?: boolean
	onlySelection?: boolean
	initialValue?: string
}

export type Collaborator = {
	id: string
	created_at: Date,
	author: string,
	path: string,
	path_colab: string,
	status: 'ACTIVE' | 'PAUSE'
}

export interface SettingsViewpoint {
	token: string
	username: string
	repo_name: string
	project_name: string
	email: string
	auto: boolean
	branch: string
	notif: boolean
	fetch: boolean
}

// =========storage=========

export type PocketSettings = {
  prefix?: string
}
export type HistoryFileViewAction = 'CREATE' | 'RENAME' | 'DELETE' | 'MODIFY' | 'LOCAL CHANGES PUSHED' | 'LOCAL CHANGES PULLED'
