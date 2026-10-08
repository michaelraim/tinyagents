# Tinyagents office world

A playful view of observed coding activity, with private offices and optional public visits.

## Language

**Office**: One developer's connected coding activity, across projects and coding clients. An office is private unless its owner publishes a visitor view.

**Project**: A repository or folder being worked on. Its display name is a label; two projects with the same name are not necessarily the same project.

**Harness**: A coding client such as Codex or Claude Code. Different harnesses can work on the same project in the same office.

**Session**: One conversation in a harness, containing a main agent and any subagents it starts.

**Team lead**: An agent with observed child agents. A main agent without children is simply an agent; a subagent can also lead its own children.

**Room**: A project's physical workspace. Sessions and larger teams can occupy connected rooms within that project.

**Vertical**: The project's topic, which guides its room atmosphere and props. A suggested vertical is a guess until the owner chooses one.

**Public office**: An explicitly published, read-only visitor view. It exposes generic states and selected display information, never connection or recovery keys.

**Friend**: A public office bookmarked in the current browser. Following does not grant access to private activity or imply a mutual friendship.

**Neighborhood**: A personal view combining one's office with selected public friend offices and common areas.

**Hangout**: A cosmetic social scene involving characters between tasks. It never sends instructions to a real agent or changes observed work state.
