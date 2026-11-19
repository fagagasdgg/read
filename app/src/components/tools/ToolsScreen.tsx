import { BookWordFrequencyTool } from './BookWordFrequencyTool'
import { NoteTagsTool } from './NoteTagsTool'
import { WordLookupTool } from './WordLookupTool'

export function ToolsScreen() {
  return (
    <div className="tools-screen">
      <header className="tools-header">
        <h1>工具</h1>
        <p className="tools-header-sub">阅读相关的实用小工具</p>
      </header>

      <div className="tools-body">
        <WordLookupTool />
        <NoteTagsTool />
        <BookWordFrequencyTool />
      </div>
    </div>
  )
}
