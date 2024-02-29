import { App, Notice, Plugin, SuggestModal, TFolder, WorkspaceLeaf } from 'obsidian'
import { GitLabAPI, GitLabOptions } from 'src/gitlab_api'
import { History, Logger, Pocket } from 'src/storage'
import { Queue } from 'src/async_queue'
import { OptionalGeneralModalConfig, SettingsViewpoint } from 'd'
import { DEFAULT_SETTINGS, GITLAB_API_URL, HISTORY_FILE, HISTORY_VIEW, LOGGER_FILE, POCKET_TOKEN_KEY } from 'static'
import { SnowflakeSettings } from 'src/settings'

import { HistoryLeaf } from 'views/history_view'
import commands from 'src/commands/barrel'
import { activate_history_view } from 'views/views'
import { file_menu_delete_file, file_menu_load_file, file_menu_send_file } from 'src/context_menu/file-menu'

/**
 * Due obsidian.d.ts I had to created interface for specific property
 * sorry for only general declarations
 */

const urlslash = (...text: string[]): string => {
	const path = text.join('/')
	const end = path.slice(path.lastIndexOf('/'))
	const start = path.slice(0, path.lastIndexOf('/')).replace(/\./gm, '%2E')
	return (start + end).replace(/\//gm, '%2F')
}

export const pocket = new Pocket()
export const sync_logs = new Logger(LOGGER_FILE)
export const gitlab = new GitLabAPI()
export const local_logs = new History(HISTORY_FILE)
export const req_queue = new Queue()

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

	command__send_changes = async () => {
		const changes = await local_logs.lines(-local_logs.lines_limit)
		changes.forEach((item: any) => {
			const parsed = local_logs.parser(item)
			if (parsed.action == 'CREATE')
				req_queue.append(async () => {
					try {
						await gitlab.create(parsed.path,
							{ commit_message: `creating file "${parsed.path}" - ${parsed.time}` }
							, false)
						sync_logs.log(`creating file "${parsed.path}"`)
					}
					catch {
						sync_logs.log(`FAIL: creating file "${parsed.path}"`)
					}
				})
			if (parsed.action == 'MODIFY')
				req_queue.append(async () => {
					try {

						await gitlab.modify(parsed.path,
							{ commit_message: `modifying file "${parsed.path}" - ${parsed.time}` }, false)
						sync_logs.log(`modifying file "${parsed.path}"`)

					} catch {
						sync_logs.log(`FAIL: modifying file "${parsed.path}"`)
					}
				})
			if (parsed.action == 'DELETE')
				req_queue.append(async () => {
					try {
						await gitlab.delete(parsed.path,
							{ commit_message: `deleting file "${parsed.path}" - ${parsed.time}` }, false)
						sync_logs.log(`deleting file "${parsed.path}"`)
					} catch {
						sync_logs.log(`FAIL: deleting file "${parsed.path}"`)
					}
				})
			if (parsed.action == 'RENAME')
				req_queue.append(async () => {
					try {
						await gitlab.create(parsed.path,
							{ commit_message: `renaming[c] file "${parsed.old_path}" -> "${parsed.path}" - ${parsed.time}` }, false)
						await gitlab.delete(parsed.old_path,
							{ commit_message: `renaming[d] file "${parsed.old_path}" -> "${parsed.path}" - ${parsed.time}` }, false)
						sync_logs.log(`renaming file "${parsed.old_path}" -> "${parsed.path}"`)
					} catch {
						sync_logs.log(`FAIL: renaming file "${parsed.old_path}" -> "${parsed.path}"`)
					}
				})
		})
		local_logs.clear()
		local_logs.callback()
	}

	async onload() {
		sync_logs.set_config_dir(this.app.vault.configDir)
		local_logs.set_config_dir(this.app.vault.configDir)

		await this.loadSettings()
		const status_bar = this.addStatusBarItem()

		this.registerView(
			HISTORY_VIEW,
			(leaf) => new HistoryLeaf(leaf)
		)

		for (const command of commands) {
			this.addCommand(command)
		}

		//===========
		this.addCommand({
			id: 'gitlab_test_snowflake',
			name: 'test',
			callback: async () => {
				// const last_pushed = pocket.get('last_pushed') || Date.now()
				// const content = Object.entries(await this.app.vault.adapter.files)
				// const filtered = content
				// 	.filter((item: any) =>
				// 		item[1].type == 'file' && (item[1].ctime > last_pushed || item[1].mtime > last_pushed)
				// 	)
				// for (const file of filtered) {
				// 	console.log(file)
				// }
				// console.log('End')
				// console.log(await gitlab.read_repo_tree())
				gitlab.get_meta_data_file('workspace/Obsidian Plugin.md').then(async data => {
					console.log(data?.headers)
					const x = await gitlab.get_commit(data?.headers['x-gitlab-last-commit-id'])
					console.log(x)
					console.log(x?.created_at)
					const file_ = app.vault.adapter.files['workspace/Obsidian Plugin.md']
					console.log(new Date(file_.ctime))
					console.log(new Date(file_.mtime))
				})
				// gitlab.get_meta_data_file('workspace/economy/Handel walutami.md').then(async data => {
				// 	console.log(data?.headers)
				// 	console.log(await gitlab.get_commit(data?.headers['x-gitlab-last-commit-id']))
				// })
				// gitlab.get_meta_data_file('workspace/economy/Bilans handlowy.md').then(async data => {
				// 	console.log(data?.headers)
				// 	console.log(await gitlab.get_commit(data?.headers['x-gitlab-last-commit-id']))
				// })
				// gitlab.get_meta_data_file('workspace/economy').then(async data => {
				// 	console.log(data?.headers)
				// 	console.log(await gitlab.get_commit(data?.headers['x-gitlab-last-commit-id']))
				// })
			}
		})
		this.addCommand({
			id: 'gitlab_test_set_snowflake',
			name: 'test_set',
			callback: async () => {
				pocket.set('last_pushed', Date.now())
				sync_logs.log('set last pushed')
				console.log(await sync_logs.lines(-2, 2))
			}
		})
		//===========
		this.addRibbonIcon('send', 'Send local changes', async (evt: MouseEvent) => {
			this.command__send_changes()
		}).addClass('my-plugin-ribbon-class')

		this.addRibbonIcon('download-cloud', 'Fetch', async (evt: MouseEvent) => {
			const nc = new Notice('Fetching...', 0)
			const res = await gitlab.get_commits()
			const last_commit = res[res.length - 1]
			if (last_commit == pocket.get('last_commit_id'))
				return nc.setMessage('Everything is up to date')
			res.forEach((commit: any) => {
				req_queue.append(async () => {
					const res = await gitlab.get_diffs(commit.id)
					res?.data.forEach(async (item: any) => {
						req_queue.append(async () => {
							try {
								if (item.new_file || (!item.renamed_file && !item.new_file && !item.deleted_file))
									await gitlab.save_local_file(item.new_path)
								if (item.renamed_file)
									await app.vault.adapter.rename(item.old_path, item.new_path)
								if (item.deleted_file)
									await app.vault.adapter.remove(item.new_path)
							} catch {
								console.log('fetching errors')
							}
						})
					})
				})
			})
			await gitlab.save_last_commit()
			nc.setMessage('Everything is up to date\nLast commit: ' + pocket.get('last_commit_id'))
		}).addClass('my-plugin-ribbon-class')


		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				file_menu_send_file(menu, file)
				file_menu_load_file(menu, file)
				file_menu_delete_file(menu, file)
				// menu.addItem((item) => {
				// 	const colab = this.settings.collaborator.find(item => item.path == file.path)
				// 	item.setTitle(`Gitlab: Start Colab`)
				// 		.setIcon("play")
				// 		.setDisabled(!!colab || file instanceof TFolder)
				// 		.onClick(async () => {
				// 			const nc = new Notice('Starting new colab...')
				// 			const snippet = await sync_data.create_colab(file.path)
				// 			const snippet_body = {
				// 				title: 'Test',
				// 				description: "okok",
				// 				visibility: 'private',
				// 			}
				// 			snippet.metadata(snippet_body)
				// 			snippet.file({
				// 				action: 'create',
				// 				file_path: 'file.xd',
				// 				content: 'Hello'
				// 			})
				// 			await snippet.create_snippet()
				// 			await snippet.from_id(snippet.snippet_id)
				// 		})
				// })
				// menu.addItem((item) => {
				// 	const colab = this.settings.collaborator.find(item => item.path == file.path)
				// 	item.setTitle(`Gitlab: Stop Colab`)
				// 		.setIcon("ban")
				// 		.onClick(async () => {
				// 			const nc = new Notice('Deleting...', 0)
				// 			req_queue.append(async () => {
				// 				if ((file as any).children) {
				// 					const read_folder = async (dir: string) => {
				// 						const content = await app.vault.adapter.list(dir)
				// 						for (const path of content.files) {
				// 							nc.setMessage(path)
				// 							await gitlab.delete(path)
				// 						}
				// 						for (const path of content.folders) {
				// 							nc.setMessage(path)
				// 							await read_folder(path)
				// 						}
				// 					}
				// 					await read_folder(file.path)
				// 				} else {
				// 					await gitlab.delete(file.path)
				// 				}
				// 				nc.setMessage('Done')
				// 			})
				// 			setTimeout(() => nc.hide(), 1000 * 7)
				// 		})
				// })
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
		setTimeout(() => {
			this.registerEvent(
				this.app.vault.on('create', async (file) => {
					local_logs.add_action('CREATE', file.path)
					if (this.settings.auto)
						req_queue.append(async () => await gitlab.create(file.path))
				})
			)
			this.registerEvent(
				this.app.vault.on('modify', async (file) => {
					local_logs.add_action('MODIFY', file.path)
					if (this.settings.auto)
						req_queue.append(async () => await gitlab.modify(file.path))
				})
			)
			this.registerEvent(
				this.app.vault.on('delete', async (file) => {
					local_logs.add_action('DELETE', file.path)
					if (this.settings.auto)
						req_queue.append(async () => await gitlab.delete(file.path))
				})
			)
			this.registerEvent(
				this.app.vault.on('rename', async (file, old_path) => {
					local_logs.add_action('RENAME', file.path, old_path)
					this.app.vault.adapter.files[file.name].rtime = Date.now()
					this.app.vault.adapter.files[file.name].old_path = old_path
					if (this.settings.auto)
						req_queue.append(async () => {
							await gitlab.create(file.path)
							await gitlab.delete(old_path)
						})
				})
			)
		}, 1000 * 3)
		setTimeout(() => {
			activate_history_view()
		}, 1000)
		this.addSettingTab(new SnowflakeSettings(this.app, this))
	}
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		const git_lab_options = this.gitlab_settings()
		gitlab.setoptions(git_lab_options)
	}
	async saveSettings() {
		await this.saveData(this.settings)
		const git_lab_options = this.gitlab_settings()
		gitlab.setoptions(git_lab_options)

	}
}



//SHOW window for remote changes - commits -> changed files

// this.registerEvent(
// 	this.app.workspace.on('editor-menu', (menu, editor: Editor) => {
// 		menu.addItem((item) => {
// 			item
// 				.setTitle("Get Block")
// 				.setIcon("block")
// 				.onClick(async () => {
// 					console.log(editor)
// 					console.log(editor.getScrollInfo())
// 					console.log(editor.getValue())
// 					console.log(editor.getLine(editor.listSelections()[0].head.line))
// 					console.log(editor.getDoc())
// 				})
// 		})
// 	})
// )