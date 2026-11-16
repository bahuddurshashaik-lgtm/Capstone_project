# User Story Creation Skill

## Purpose
This skill guides AI agents in creating well-structured user stories that follow agile best practices. It ensures stories are clear, testable, and actionable for development teams across any project domain.

## Usage
Invoke this skill when:
- Creating new user stories from requirements or feature requests
- Converting stakeholder requests into structured Jira stories
- Breaking down epics into manageable user stories
- Validating existing user stories for quality and completeness

## Core Rules

### 1. Clear Requirement
Follow the standard user story format:
```
As a [user role/persona],
I want [specific feature/capability],
so that [clear business benefit/value].
```
- **User role** must be specific (e.g., "registered customer", "system administrator")
- **Feature** must be actionable and unambiguous
- **Benefit** must articulate clear value to the user or business

### 2. Acceptance Criteria
Define clear, measurable, and testable acceptance criteria that specify:
- **Given-When-Then** format preferred for clarity
- Observable behaviors and outcomes
- Boundary conditions and edge cases
- Success and failure scenarios
- Any UI/UX requirements or validation rules

Each criterion must be independently verifiable and unambiguous.

### 3. INVEST Principle
Ensure every story adheres to INVEST:
- **Independent:** Story can be developed without tight coupling to other stories
- **Negotiable:** Details can be refined through collaboration
- **Valuable:** Delivers clear value to users or stakeholders
- **Estimable:** Team can reasonably estimate effort required
- **Small:** Can be completed within a single sprint or iteration
- **Testable:** Has clear criteria that can be validated

### 4. Scope & Dependencies
Identify and document:
- **Business Rules:** Constraints, validations, or policies that must be enforced
- **Assumptions:** Any preconditions or expected system state
- **Dependencies:** Related stories, external systems, or technical prerequisites
- **Limitations:** Known constraints, out-of-scope items, or technical debt

**Critical:** Never invent or assume missing requirements. If essential information is unclear or unavailable, explicitly flag it and request clarification from stakeholders.

### 5. Review Before Creation
Before finalizing any user story, validate:
- **Ambiguity Check:** All terms and requirements are clearly defined
- **Duplication Check:** Story does not overlap with existing stories
- **Completeness Check:** All necessary information is present (description, criteria, dependencies)
- **Consistency Check:** Story aligns with original requirement and project goals
- **Feasibility Check:** Story is achievable with available resources and technology

## Validation Checklist

Before creating a Jira story, confirm:
- [ ] User story follows "As a... I want... so that..." format
- [ ] At least 3-5 acceptance criteria are defined and testable
- [ ] Story adheres to all INVEST principles
- [ ] All dependencies and assumptions are documented
- [ ] No missing or assumed information
- [ ] Story is reviewed for ambiguity, duplication, and completeness
- [ ] Story size is appropriate for a single sprint
- [ ] Business rules and constraints are clearly stated
- [ ] Story has been validated against the original requirement

## Expected Output

Each user story should include:

1. **Title:** Brief, descriptive summary (max 60 characters)
2. **Description:** Full user story in "As a... I want... so that..." format
3. **Acceptance Criteria:** Numbered list of testable criteria (3-5 minimum)
4. **Story Points/Effort Estimate:** If requested or determinable
5. **Dependencies:** List of blocking or related items
6. **Assumptions:** Any preconditions or expected state
7. **Business Rules:** Constraints or policies to enforce
8. **Labels/Tags:** Relevant categorization (e.g., frontend, API, bug-fix)
9. **Priority:** If specified by stakeholder

## Handling Missing Information

When essential information is missing or unclear:
1. **Stop and flag the gap explicitly** - do not proceed with assumptions
2. **List specific questions** that need answers
3. **Explain the impact** of the missing information on story quality
4. **Suggest options** if multiple interpretations are possible
5. **Wait for clarification** before creating the story

## Quality Standards

High-quality user stories are:
- **Focused:** Single responsibility, one clear goal
- **User-centric:** Written from user's perspective
- **Value-driven:** Clear benefit articulated
- **Actionable:** Developer knows what to build
- **Testable:** QA knows how to verify
- **Estimable:** Team can size the work
- **Complete:** All necessary context provided

---

**Note for AI Agents:** This skill is technology-agnostic and project-independent. Apply these principles consistently across all domains, frameworks, and development methodologies.
