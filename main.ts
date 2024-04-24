import { Notice, Plugin } from 'obsidian'
import { GitLabAPI, GitLabOptions } from 'src/gitlab_api'
import { History, Logger, Pocket } from 'src/storage'
import { Queue } from 'src/async_queue'
import { SettingsViewpoint } from 'd'
import { DEFAULT_SETTINGS, GITLAB_API_URL, HISTORY_FILE, HISTORY_VIEW, INTERVAL_AFTER_CHANGES, LOGGER_FILE, POCKET_TOKEN_KEY } from 'src/static'
import { SnowflakeSettings } from 'src/settings'

import { HistoryLeaf } from 'views/history_view'
import commands from 'src/commands/barrel'
import { activate_history_view } from 'views/views'
import { file_menu_delete_file, file_menu_load_file, file_menu_send_file } from 'src/context_menu/file-menu'
import { command__fetch_changes, command__send_changes, send_changes_gitlab } from 'src/commands/repository_controller'
import { callback_time_buffer } from 'src/utils'


export const gitlab = new GitLabAPI()
export const pocket = new Pocket()
export const req_queue = new Queue()

export const sync_logs = new Logger(LOGGER_FILE)
export const local_changes_logs = new History(HISTORY_FILE)

export default class SyncSnowflake extends Plugin {
	settings: SettingsViewpoint
	gitlab_settings = (): GitLabOptions => {
		return {
			api: GITLAB_API_URL,
			token: pocket.get(POCKET_TOKEN_KEY) || '',
			project: this.settings.project_name,
			repository: this.settings.repo_name,
			email: this.settings.email,
			nick: this.settings.username,
			branch: this.settings.branch,
			notifications: this.settings.notif
		}
	}

	async onload() {
		sync_logs.set_config_dir(this.app.vault.configDir)
		local_changes_logs.set_config_dir(this.app.vault.configDir)

		await this.loadSettings()
		const status_bar = this.addStatusBarItem()

		this.registerView(
			HISTORY_VIEW,
			(leaf) => new HistoryLeaf(leaf)
		)

		for (const command of commands) {
			this.addCommand(command)
		}

		this.addRibbonIcon('send', 'Send local changes', async (evt: MouseEvent) => {
			command__send_changes()
		}).addClass('my-plugin-ribbon-class')

		this.addRibbonIcon('download-cloud', 'Fetch', async (evt: MouseEvent) => {
			command__fetch_changes()
		}).addClass('my-plugin-ribbon-class')


		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				file_menu_send_file(menu, file)
				file_menu_load_file(menu, file)
				file_menu_delete_file(menu, file)
			})
		)

		this.registerEvent(
			this.app.workspace.on('file-open', async (file) => {
				if (!this.settings.auto) return
				if (!file?.path) return
				req_queue.append(async () => {
					status_bar.setText('Syncing...')
					await gitlab.save_local_file(file.path, file.path, true)
					status_bar.setText('Sync done')
				})
			})
		)

		let callback_buffer = callback_time_buffer()

		setTimeout(() => {
			this.registerEvent(
				this.app.vault.on('create', async (file) => {
					await local_changes_logs.add_action('CREATE', file.path)
					if (this.settings.auto)
						callback_buffer = callback_buffer.break_interval_and_push_task(
							command__send_changes,
							INTERVAL_AFTER_CHANGES * 1000
						)
				})
			)
			this.registerEvent(
				this.app.vault.on('modify', async (file) => {
					await local_changes_logs.add_action('MODIFY', file.path)
					if (this.settings.auto)
						callback_buffer = callback_buffer.break_interval_and_push_task(
							command__send_changes,
							INTERVAL_AFTER_CHANGES * 1000
						)
				})
			)
			this.registerEvent(
				this.app.vault.on('delete', async (file) => {
					await local_changes_logs.add_action('DELETE', file.path)
					if (this.settings.auto)
						callback_buffer = callback_buffer.break_interval_and_push_task(
							command__send_changes,
							INTERVAL_AFTER_CHANGES * 1000
						)
				})
			)
			this.registerEvent(
				this.app.vault.on('rename', async (file, old_path) => {
					await local_changes_logs.add_action('RENAME', file.path, old_path)
					this.app.vault.adapter.files[file.name].rtime = Date.now()
					this.app.vault.adapter.files[file.name].old_path = old_path
					if (this.settings.auto)
						callback_buffer = callback_buffer.break_interval_and_push_task(
							command__send_changes,
							INTERVAL_AFTER_CHANGES * 1000
						)
				})
			)
		}, 1000 * 3)

		setTimeout(() => {
			activate_history_view()

			if (this.settings.fetch)
				command__fetch_changes()
		}, 1000)

		this.addSettingTab(new SnowflakeSettings(this.app, this))
	}
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		pocket.prefix = `snowflake_obsidian_${this.settings.project_name + this.settings.repo_name}`
		const git_lab_options = this.gitlab_settings()
		gitlab.setoptions(git_lab_options)
	}
	async saveSettings() {
		await this.saveData(this.settings)
		pocket.prefix = `snowflake_obsidian_${this.settings.project_name + this.settings.repo_name}`
		const git_lab_options = this.gitlab_settings()
		gitlab.setoptions(git_lab_options)
	}
}
