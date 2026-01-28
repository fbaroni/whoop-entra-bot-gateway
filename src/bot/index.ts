import 'dotenv/config';
import { getConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { handleCommand } from './commands/index.js';

// This is a minimal bot implementation that processes commands.
// In production, this would integrate with Clawdbot's channel adapter
// for Telegram/WhatsApp messaging.

// For local development, we'll create a simple CLI interface.

async function main() {
  try {
    // Validate config on startup
    const config = getConfig();
    logger.info('Bot starting', { apiBaseUrl: config.API_BASE_URL });

    // Import readline for CLI interaction
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const userId = 'cli-user'; // Mock user ID for CLI

    console.log('\n=== Triathlon Assistant Bot (CLI Mode) ===');
    console.log('Type "help" for available commands, or "exit" to quit.\n');

    const prompt = () => {
      rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          console.log('Goodbye!');
          rl.close();
          process.exit(0);
        }

        if (!input.trim()) {
          prompt();
          return;
        }

        try {
          const result = await handleCommand(userId, input);
          console.log('\n' + result.response + '\n');
        } catch (error) {
          logger.error('Command error', {
            error: error instanceof Error ? error.message : String(error),
          });
          console.log('\nSorry, something went wrong. Please try again.\n');
        }

        prompt();
      });
    };

    prompt();
  } catch (error) {
    logger.error('Bot failed to start', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();

// Export for Clawdbot integration
export { handleCommand } from './commands/index.js';
