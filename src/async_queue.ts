export class Queue {
	actions: (() => Promise<any>)[] = []
	constructor() { }
	append(action: () => Promise<any>) {
		this.actions.push(action)
		if (this.actions.length == 1)
			this.action_handle()
	}
	async action_handle() {
		if (this.actions.length != 0) {
			const action = this.actions[0]
			if (action)
				await action()
			this.actions.shift()
			this.action_handle()
		}
	}
}