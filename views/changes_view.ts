import { history } from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";


export const CHANGES_VIEW = 'changes-view'

export class ChangesLeaf extends ItemView {
  div_container:HTMLElement
  constructor(leaf: WorkspaceLeaf){
    super(leaf)
  }
  icon:string = 'layout-list'
  getViewType(): string {
    return CHANGES_VIEW
  }
  getDisplayText(): string {
    return 'Snowflake Local Changes'
  }
  async reload_logs(){
    const logs = await history.lines(-300)
    this.div_container.empty()
    logs.reverse()
    logs.forEach(item => {
      this.div_container.createEl('span', {
        text: item
      })
    })
  }
  create_button(parent: Element, name:string, callback: () => void){
    const button = parent.createEl('button', {
      text: name
    })
    button.style.margin = '10px'
    button.addEventListener('click', () => {
      console.log(`click ${name}`)
    })

  }
  async render(){
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h3", { text: "Snowflake Local Changes" });
    this.create_button(container, 'Send changes', () => {})
    this.create_button(container, 'Clear changes', () => {})
    const div = container.createEl('div')
    this.div_container = div
    div.style.fontSize = '11px'
    div.style.maxHeight = '500px'
    div.style.overflowY = 'auto'
    div.style.display = 'flex'
    div.style.flexDirection = 'column-reverse'

  }
  async update(): Promise<void> {
    await this.reload_logs()
  }
  async onOpen(): Promise<void> {
    await this.render()
    await this.reload_logs()
  }
}