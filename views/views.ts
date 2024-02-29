import { App, WorkspaceLeaf } from "obsidian"
import { local_logs, sync_logs } from "main"
import { HISTORY_VIEW } from "static"
import { HistoryLeaf } from "./history_view"



export const  activate_history_view = async() =>  {
  const { workspace } = app

  let leaf: WorkspaceLeaf | null = null
  const leaves = workspace.getLeavesOfType(HISTORY_VIEW)
  if (leaves.length > 0) {
    leaf = leaves[0]
  } else {
    leaf = workspace.getRightLeaf(false)
    await leaf.setViewState({ type: HISTORY_VIEW, active: false })
  }
  sync_logs.set_callback(() => {
    if (leaf)
      (leaf.view as HistoryLeaf).update()
  })
  local_logs.set_callback(() => {
    if (leaf)
      (leaf.view as HistoryLeaf).update()
  })
}