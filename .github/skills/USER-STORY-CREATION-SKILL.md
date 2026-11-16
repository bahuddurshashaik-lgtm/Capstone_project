# User Story Creation Skill

## Purpose
This skill provides a structured framework for AI agents to create well-formed user stories that are clear, testable, and aligned with agile development principles. It ensures consistency, completeness, and quality across user story creation tasks.

## Usage
Invoke this skill when:
- Creating new user stories from requirements or feature requests
- Validating existing user stories for completeness and quality
- Breaking down epics or features into user stories
- Reviewing user stories before submission to issue tracking systems

## Core Rules

### 1. Clear Requirement
Follow the standard user story format:
```
As a [user/role],
I want [feature/functionality],
so that [benefit/business value].
```
- **Who:** Clearly identify the user persona or role
- **What:** Describe the specific feature or functionality needed
- **Why:** Explain the business value or benefit

### 2. Acceptance Criteria
Define clear, measurable, and testable acceptance criteria:
- Use Given-When-Then format or bullet-point checklist
- Each criterion must be verifiable through testing
- Criteria should cover both happy path and edge cases
- Ensure criteria are specific, not vague or ambiguous
- Include any relevant data validation, error handling, or UI behavior

### 3. INVEST Principle
Ensure each user story follows the INVEST principle:
- **Independent:** Story can be developed without dependency on other stories
- **Negotiable:** Details can be discussed and refined with stakeholders
- **Valuable:** Story delivers clear value to users or business
- **Estimable:** Team can reasonably estimate effort required
- **Small:** Story can be completed within one sprint or iteration
- **Testable:** Story has clear acceptance criteria that can be validated

### 4. Scope & Dependencies
Identify and document:
- **Business Rules:** Any specific rules or constraints that apply
- **Assumptions:** Explicit statements about what is assumed to be true
- **Dependencies:** Technical or business dependencies on other work
- **Limitations:** Known constraints or out-of-scope items
- **Never invent missing requirements:** If critical information is missing, explicitly flag it and request clarification from stakeholders

### 5. Review Before Creation
Before finalizing any user story, validate:
- **Ambiguity Check:** Are all terms and requirements clearly defined?
- **Duplication Check:** Does this story overlap with existing stories?
- **Completeness Check:** Are all necessary details included?
- **Consistency Check:** Does this align with the original requirement and project goals?
- If any validation fails, resolve the issue before proceeding

## Validation Checklist

Before submitting a user story, verify:

- [ ] User story follows the "As a... I want... so that..." format
- [ ] All three parts (who, what, why) are clearly stated
- [ ] Acceptance criteria are specific, measurable, and testable
- [ ] Story follows all six INVEST principles
- [ ] Business rules and assumptions are documented
- [ ] Dependencies and limitations are identified
- [ ] No missing or unclear requirements
- [ ] No duplication with existing stories
- [ ] Story is sized appropriately for one iteration
- [ ] Technical feasibility has been considered

## Expected Output

A complete user story should include:

1. **Title:** Brief, descriptive summary (e.g., "User Login with Email")
2. **User Story:** Full "As a... I want... so that..." statement
3. **Acceptance Criteria:** Numbered or bulleted list of testable criteria
4. **Business Rules:** Any relevant rules or constraints
5. **Assumptions:** Explicit assumptions made
6. **Dependencies:** Technical or business dependencies
7. **Limitations:** Out-of-scope items or known constraints
8. **Estimation:** Story points or time estimate (if applicable)
9. **Priority:** Business priority level (if applicable)

## Handling Missing Information

When essential information is missing:
1. **Do not invent or assume** missing requirements
2. **Clearly flag** what information is needed
3. **Ask specific questions** to gather the required details
4. **Document** any assumptions temporarily made
5. **Wait for clarification** before finalizing the story

## Example Template

```
Title: [Brief descriptive title]

User Story:
As a [user role],
I want [functionality],
so that [business value].

Acceptance Criteria:
1. Given [context], when [action], then [expected result]
2. Given [context], when [action], then [expected result]
3. [Additional criteria...]

Business Rules:
- [Rule 1]
- [Rule 2]

Assumptions:
- [Assumption 1]
- [Assumption 2]

Dependencies:
- [Dependency 1]
- [Dependency 2]

Limitations:
- [Out of scope item 1]
- [Out of scope item 2]

Estimation: [Story points or time]
Priority: [High/Medium/Low]
```
