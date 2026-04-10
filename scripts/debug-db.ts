
import { sbGetFilteredArticles } from './src/lib/supabase-server-db';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function testConnection() {
  console.log('Testing Supabase connection and article retrieval...');
  try {
    const result = await sbGetFilteredArticles({ page: 1, limit: 10, authed: true });
    console.log('Result count:', result.articles.length);
    console.log('Total in DB:', result.total);
    if (result.articles.length > 0) {
      console.log('First article title:', result.articles[0].title);
    } else {
      console.warn('Articles list is EMPTY. This is the problem.');
    }
  } catch (e) {
    console.error('Error occurred during fetching articles:', e.message);
  }
}

testConnection();
