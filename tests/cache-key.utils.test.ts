import { CacheKeyGenerator } from '../src/utils/cache-key.utils';

describe('CacheKeyGenerator', () => {
  describe('forEntity', () => {
    it('should generate key for entity with id', () => {
      const entity = { constructor: { name: 'User' }, id: 123 };
      const key = CacheKeyGenerator.forEntity(entity);
      expect(key).toBe('User:id:123');
    });
    
    it('should use custom prefix from options', () => {
      const entity = { constructor: { name: 'User' }, id: 123 };
      const key = CacheKeyGenerator.forEntity(entity, 'CustomUser');
      expect(key).toBe('CustomUser:id:123');
    });
  });
  
  describe('buildKey', () => {
    it('should build key from parts', () => {
      const key = CacheKeyGenerator.buildKey('user', 'id', 123);
      expect(key).toBe('user:id:123');
    });
    
    it('should filter undefined and null values', () => {
      const key = CacheKeyGenerator.buildKey('user', undefined as any, 'active', null as any, true);
      expect(key).toBe('user:active:true');
    });
  });
  
  describe('parseKey', () => {
    it('should parse key into components', () => {
      const parsed = CacheKeyGenerator.parseKey('user:id:123:relation:roles');
      expect(parsed).toEqual({
        entity: 'user',
        type: 'id',
        id: '123',
        rest: ['relation', 'roles']
      });
    });
  });
  
  describe('pattern', () => {
    it('should generate pattern for entity', () => {
      const pattern = CacheKeyGenerator.pattern('User');
      expect(pattern).toBe('User:*');
    });
    
    it('should generate pattern with type', () => {
      const pattern = CacheKeyGenerator.pattern('User', 'query');
      expect(pattern).toBe('User:query:*');
    });
  });
  
  describe('forPagination', () => {
    it('should generate key for pagination', () => {
      const key = CacheKeyGenerator.forPagination('User', 2, 10);
      expect(key).toBe('User:page:2:10:default');
    });
    
    it('should include options hash', () => {
      const key = CacheKeyGenerator.forPagination('User', 1, 20, { active: true });
      expect(key).toMatch(/^User:page:1:20:[a-f0-9]{16}$/);
    });
  });
  
  describe('forCount', () => {
    it('should generate key for count', () => {
      const key = CacheKeyGenerator.forCount('User');
      expect(key).toBe('User:count:all');
    });
    
    it('should include options hash', () => {
      const key = CacheKeyGenerator.forCount('User', { active: true });
      expect(key).toMatch(/^User:count:[a-f0-9]{16}$/);
    });
  });
});