import { SyncSnowflake, pocket } from "main"
import { App, Notice, PluginSettingTab, Setting } from "obsidian"

export class SnowflakeSettings extends PluginSettingTab {
	plugin: SyncSnowflake

	constructor(app: App, plugin: SyncSnowflake) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()
		const set = () => new Setting(containerEl)
		set().setName('Token') 
			.setDesc('Here is gitlab token')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue('*'.repeat(pocket.get('gitlabtoken')?.length || 0))
				.onChange(async (value) => {
					pocket.set('gitlabtoken', value)
					await this.plugin.saveSettings()
				}))
		set().setName('Email')
			.setDesc('Here is email - git commit')
			.addText(text => text
				.setPlaceholder('Enter your email')
				.setValue(this.plugin.settings.email)
				.onChange(async (value) => {
					this.plugin.settings.email = value
					await this.plugin.saveSettings()
				}))
		set().setName('Username')
			.setDesc('Here is gitlab username - git commit')
			.addText(text => text
				.setPlaceholder('Enter your username')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value
					await this.plugin.saveSettings()
				}))
		set().setName('Project')
			.setDesc('Here is gitlab project name')
			.addText(text => text
				.setPlaceholder('Enter project name')
				.setValue(this.plugin.settings.project_name)
				.onChange(async (value) => {
					this.plugin.settings.project_name = value
					await this.plugin.saveSettings()
				}))
		set().setName('Name')
			.setDesc('Here is gitlab repository name')
			.addText(text => text
				.setPlaceholder('Enter repository name')
				.setValue(this.plugin.settings.repo_name)
				.onChange(async (value) => {
					this.plugin.settings.repo_name = value
					await this.plugin.saveSettings()
				}))
		set().setName('Main branch')
			.setDesc('Here is gitlab main branch name')
			.addText(text => text
				.setPlaceholder('Enter your branch name')
				.setValue(this.plugin.settings.branch)
				.onChange(async (value) => {
					this.plugin.settings.branch = value
					await this.plugin.saveSettings()
				}))
		set().setName('Sync Auto')
			.setDesc('Set on if you want to sync repository automatically')
			.addToggle(cb => cb.setValue(this.plugin.settings.auto)
				.onChange(async (value) => {
					this.plugin.settings.auto = value
					await this.plugin.saveSettings()
					new Notice(`Auto Mode: ${value ? 'on' : 'off'}`)
				}))
		set().setName('Fetch on start')
			.setDesc('Set on if you want to sync repository on start')
			.addToggle(cb => cb.setValue(this.plugin.settings.fetch)
				.onChange(async (value) => {
					this.plugin.settings.fetch = value
					await this.plugin.saveSettings()
					new Notice(`Auto Fetch: ${value ? 'on' : 'off'}`)
				}))
		set().setName('Notifications')
			.setDesc('Set on if you want notifications')
			.addToggle(cb => cb.setValue(this.plugin.settings.notif)
				.onChange(async (value) => {
					this.plugin.settings.notif = value
					await this.plugin.saveSettings()
					new Notice(`Notifications: ${value ? 'on' : 'off'}`)
				}))
		set().setName('Reload Settings')
			.setDesc('Click to reload current settings')
			.addButton(cb => cb.setButtonText('Reload').setIcon('refresh-cw').onClick(() => {
				this.plugin.loadSettings()
				new Notice('Settings updated')
			}))
	}
}
