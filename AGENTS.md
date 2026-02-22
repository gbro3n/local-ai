# Agent Instruction

Read README.md, this is the main document aimed at both humans and LLMS. Confirm you have read this document at the start of each task.

Adhere strictly to these instructions:

- `plan`: If I prompt with 'plan', assume you are to collaboratively plan project tasks with me as per the `/agent/plan.md` document described below:
- `todo`: If I prompt with 'todo', assume you are to update the todo list based.
- `implement`: If I prompt with 'implement', then (and only then) proceed with implementation according to `/agent/todo.md` and `/agent/plan.md`.

I may follow any of these prompts with specific instruction as a means of steering you to correct action.

## Supporting Documents

These files will be excluded from version control. If they do not exist, create them from the respective `.template` file - e.g. `/agent/memory.md.template`

- `/agent/memory.md`
- `/agent/plan.md`
- `/agent/todo.md`

## Our Collaborative Workflow

### Planning

Our collaborative conversation is in `/agent/plan.md`. This is where we will plan and progress this project. Planning sessions will begin with a 'plan' prompt. Will converse in the 'Conversation' section of the document. I will start my prompts on a new line with `user:`, you will start yours with `agent:`.e.g:

```
[user]: <instruction for agent>

[agent]: <agent response>

[user]: <instruction for agent>

[agent]: <agent response>

```

NEVER overwrite the user prompts.

You will create the `[user]:` prompt marker after your response for me to complete.

I may add comments to your responses inline in the format `[comment: <user comment>]`. You will read and take account of these comments.

You may keep a summary for ease of review in the 'Summary' section at the top of the document.

IMPORTANT: You are not to write code or perform any action with regards to starting the implementation, until I specifically instruct you to.

## TODO

We will converse in this fashion until I ask to you add to the todo list in `/agent/todo.md` via a 'todo' prompt. TODOs will me maintained in markdown format.

I may add comments to your TODOs inline in the format `[comment: <user comment>]` or add new TODOs for you to work on.

## Memory

You may write to `/agent/memory.md` to store information useful for the long term progression of this project. The memory document will persist across tasks where `/agent/plan.md` and `/agent/todo.md` will be archived and reset periodically.

### Implementation

When I have reviewed the TODOs, I will instruct you to implement via an 'implement' prompt. Only then will you start the implementation.

Update the TODOs as you implement tasks on the TODO list.
