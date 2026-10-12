# D Chat Features

A real time chat app for teams, with an admin panel, polls, leave management and more.

Total features: 88

## Login and Account

1. Login with email and password
2. Sign up with Gmail OTP verification
3. Forgot password: reset using a Gmail OTP
4. One account per Gmail (dot and plus tag tricks are blocked)
5. Edit your profile name and status
6. Upload a profile photo
7. Secure passwords (bcrypt) and JWT sessions
8. Automatic logout when the session expires or the account is removed

## Chat and Messaging

9. One to one real time chat
10. Group chat
11. Notes to Self: a personal chat only you can see
12. Reply to any message (tap the reply to jump to the original)
13. Edit your own messages (shows an edited label)
14. Delete your own messages for everyone
15. Forward messages to users or groups
16. Copy a message
17. Pin multiple messages (cycle through them in the pinned bar)
18. Search messages and files inside a chat
19. Sending time on every message
20. Ticks: grey double tick means received, coloured double tick means seen (updates live)
21. Typing indicator
22. Unread message count badge for every chat and group
23. Online and offline status
24. Search users and chats in the sidebar
25. Emoji picker with 9 categories and 400 plus emojis

## Emoji and Reactions

26. React with any emoji (8 quick reactions plus the full picker)
27. Animated emoji: emoji only messages pop in big
28. Reaction counts, with who reacted shown on hover

## Files and Media

29. Send multiple files at once
30. Drag and drop files into the chat
31. Very large files (up to about 32 GB, configurable)
32. Photo gallery grid when several images are sent together
33. In chat file preview: PDF, images, video, audio and text
34. Download any file or image
35. Voice messages (record, cancel, play)
36. Share current location with a map preview
37. Auto GIF maker: turns an image or video into an animated GIF

## Groups and Polls

38. Create multiple groups
39. Group admin can add members
40. Group admin can remove members
41. Leave a group (button or /leave)
42. Rename a group
43. Admin role passes automatically to another member if the admin leaves
44. System messages (X joined, left or was removed)
45. Create a poll (a question with up to 8 options)
46. Vote or change your vote, with live percentage bars
47. Close a poll (no one can vote after it is closed)
48. Delete a poll

## Slash Commands

49. / shows a suggestion list of all commands
50. /leave leaves the current group (in a one to one chat it opens your leave balance)
51. /leaves opens your leave balance from any chat
52. /poll opens the form to create a group poll
53. /name sends the documents the admin uploaded under that name (for example /policy)

## Personal Notes

54. Create private notes with colour labels
55. Edit and delete notes
56. Word and character counter

## Notifications

57. In app pop up for every new message
58. Choose where pop ups appear: top left, top right, bottom left or bottom right
59. Browser (desktop) notifications
60. Message sound on or off
61. Admin announcements in a bell with an unread badge
62. Mark all as read for announcements

## Personalization

63. 6 chat themes: Dark, Ocean, Forest, Rose, Midnight, Warm
64. Works on mobile (responsive layout)

## Privacy

65. Block and unblock users
66. Private chats and groups are visible only to their members

## Leave Management

67. Apply for leave (full day or half day)
68. Leave balance showing total, used and remaining
69. Leave history by year
70. Cancel a pending leave request
71. Live notification when a leave is approved or rejected

## Admin Panel

72. Admin login
73. Multiple admins: new admins register with a secret key
74. Dashboard with total users, messages, groups and online users
75. Messages per user chart
76. Create users directly (no OTP needed)
77. Delete users (removes their data and logs them out)
78. View all messages and delete any of them
79. Bulk delete selected messages
80. Delete groups
81. Broadcast an announcement to every user at once
82. Upload multiple documents under one /name keyword
83. Set the yearly leave quota (for example 18 days in 2026)
84. Approve or reject leave requests
85. Add a leave for any user
86. One click database backup (JSON download)
87. Search and filter in every table
88. Manage admins (list, add, remove)