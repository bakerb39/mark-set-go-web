# v9.4.8 live Ask Beth message identity fix

- Fixes newly rendered assistant replies that were still labeled MARK with Mark's avatar after Beth was selected.
- Adds a MutationObserver scoped only to the companion/chat panel, so asynchronous new chat messages are updated immediately.
- Does not observe the reader, selection UI, or context menu.
- No right-click/contextmenu handler or reader runtime code was modified.
