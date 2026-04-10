
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase credentials not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('Migrating database: Adding deleted_at column to articles table...');
  
  // SQL 실행 (RPC 함수가 없는 경우를 대비해 직접 API 호출 시도)
  // 여기서는 Supabase 클라이언트를 사용하여 컬럼 추가 SQL을 실행할 방법이 제한적이므로
  // 간단한 업데이트를 시도하여 컬럼 존재 여부를 먼저 확인하고 에러 시 대응하는 전략을 쓰거나
  // Supabase SQL API가 열려있는지 확인합니다.
  
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: 'ALTER TABLE articles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;'
  });

  if (error) {
    if (error.message.includes('function "exec_sql" does not exist')) {
      console.log('RPC "exec_sql" not found. Trying alternative method...');
      // 다른 방법 시도: 기사 하나를 조회해보고 deleted_at이 진짜 없는지 확인
      const { error: selectError } = await supabase.from('articles').select('deleted_at').limit(1);
      if (selectError && selectError.message.includes('column "deleted_at" does not exist')) {
         console.error('컬럼이 없습니다. Supabase 대시보드(SQL Editor)에서 다음을 직접 실행해 주세요:');
         console.error('ALTER TABLE articles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;');
      } else {
         console.log('컬럼이 이미 존재하거나 다른 오류입니다:', selectError?.message);
      }
    } else {
      console.error('Migration failed:', error.message);
    }
  } else {
    console.log('Migration successful: deleted_at column added.');
  }
}

migrate();
