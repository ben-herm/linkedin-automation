-- Remove fake test responses
DELETE FROM responses 
WHERE unipile_message_id LIKE 'test-%' 
OR content LIKE 'Thanks for reaching out%'
OR content LIKE 'Hi there! I came across%'
OR content LIKE 'Hello from Emma%';

-- Show remaining responses for Emma
SELECT id, content, unipile_message_id, status, received_at
FROM responses 
WHERE lead_id = 492
ORDER BY received_at DESC;
