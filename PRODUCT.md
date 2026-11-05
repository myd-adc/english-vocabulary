# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner and a few invited friends (invite-only, a handful of accounts), Ukrainian speakers learning English. They meet unfamiliar English words while reading, watching series and at work (meetings, chats), and want to keep them. The app is installed on the phone's home screen as a PWA and used mostly on iPhone; sometimes on a laptop.

## Product Purpose

A personal English to Ukrainian dictionary that fills itself: type a word or phrase, get a dictionary-quality translation (parts of speech, meanings, base form, typo fix) and a topic automatically, then browse the collection by topic and review it with flashcards and quizzes. Success is that capturing a word is instant and effortless, so people actually do it every time they meet one.

## Positioning

Unlike a flashcard app where you type both sides yourself, here you type only the English word and the app writes a proper dictionary entry and files it under a topic. Idioms and phrasal verbs are translated as wholes. Words can also be added from a conversation with Claude through the app's MCP connector.

## Operating Context

- Three jobs, in order of importance: capture a word the moment you meet it (open, type, see the translation, close); review words in a spare minute (cards, quiz); browse your own dictionary by topic.
- Mostly one-handed on a phone, often mid-task in another app; sessions are seconds long for capture, a few minutes for review.
- Ukrainian UI copy; English headwords.

## Capabilities and Constraints

- Quick add with LLM translation (Groq, with backup models), pending state while translating, statuses: created, already exists, not English, translation unavailable (manual form), error.
- Topics assigned automatically; topics can be renamed or merged; words can be edited or deleted.
- Review: choose topics, mode (flashcards or quiz), direction, audio; spaced-repetition ratings.
- Speech (text to speech) for headwords.
- Accounts via Supabase (email + password, Google); invite-only allowlist; per-user dictionaries.
- PWA: installable, offline shell, light and dark themes (system or chosen).
- Stack: React + Vite + TypeScript + CSS Modules in `web/`, FastAPI backend in `app/`. Service URL: `glossa-app.onrender.com`.

## Brand Commitments

- Name: **Glossa**.
- The owner has rejected the current look as boring and characterless, too "bookish" (Garamond and italics feel old-fashioned), wrong colours, and "like a website, not an app". They want it to feel like a real, polished phone app.

## Evidence on Hand

- Screenshots of a third-party vocabulary app the owner used before (dark green gradient, rounded list cells, bottom tab bar, big plus button) exist only in the conversation, not in the repo.
- No testimonials, metrics or marketing content; none should be invented.

## Product Principles

1. Capture first: adding a word must be the fastest, most obvious action on every screen.
2. It should feel native on a phone: app-like navigation, touch targets, motion that answers touches.
3. The word is the hero: headword and its translation are the most legible things on screen.
4. Personal, not institutional: it is someone's own collection, with warmth and character.
