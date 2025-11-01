import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TTCacheService } from '../src/services/ttcache.service';
import { CacheKeyGenerator } from '../src/utils';
import { User, Role } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly cacheService: TTCacheService
  ) {}
  
  /**
   * Find user by ID - uses cache automatically through CachedBaseEntity
   */
  async findById(id: number): Promise<User | null> {
    // This will automatically use cache
    return await User.findByIdWithCache(id);
  }
  
  /**
   * Find user by email with custom cache key
   */
  async findByEmail(email: string): Promise<User | null> {
    const cacheKey = CacheKeyGenerator.buildKey('user', 'email', email);
    
    return await this.cacheService.readThrough(
      cacheKey,
      () => this.userRepository.findOne({ 
        where: { email },
        relations: ['roles']
      }),
      3600 // 1 hour TTL
    );
  }
  
  /**
   * Create a new user - automatically cached on save
   */
  async createUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    roleIds?: number[];
  }): Promise<User> {
    const user = new User();
    user.email = data.email;
    user.firstName = data.firstName;
    user.lastName = data.lastName;
    
    if (data.roleIds && data.roleIds.length > 0) {
      user.roles = await this.roleRepository.findByIds(data.roleIds);
    }
    
    // Save will automatically cache the user
    return await user.save();
  }
  
  /**
   * Update user - automatically invalidates cache
   */
  async updateUser(id: number, data: Partial<User>): Promise<User | null> {
    const user = await User.findByIdWithCache(id);
    if (!user) return null;
    
    Object.assign(user, data);
    
    // Save will automatically update cache
    return await user.save();
  }
  
  /**
   * Delete user - automatically removes from cache
   */
  async deleteUser(id: number): Promise<boolean> {
    const user = await User.findByIdWithCache(id);
    if (!user) return false;
    
    // Remove will automatically delete from cache
    await user.remove();
    return true;
  }
  
  /**
   * Find active users with caching
   */
  async findActiveUsers(): Promise<User[]> {
    const cacheKey = CacheKeyGenerator.buildKey('user', 'active', 'list');
    
    const users = await this.cacheService.readThrough(
      cacheKey,
      () => this.userRepository.find({
        where: { isActive: true },
        relations: ['roles'],
        order: { createdAt: 'DESC' }
      }),
      1800 // 30 minutes TTL
    );
    
    return users || [];
  }
  
  /**
   * Search users with query caching
   */
  async searchUsers(query: string): Promise<User[]> {
    const cacheKey = CacheKeyGenerator.buildKey('user', 'search', query);
    
    const users = await this.cacheService.readThrough(
      cacheKey,
      () => this.userRepository
        .createQueryBuilder('user')
        .where('user.firstName ILIKE :query OR user.lastName ILIKE :query OR user.email ILIKE :query', 
          { query: `%${query}%` })
        .leftJoinAndSelect('user.roles', 'roles')
        .getMany(),
      900 // 15 minutes TTL
    );
    
    return users || [];
  }
  
  /**
   * Get paginated users with cache
   */
  async getPaginatedUsers(page: number = 1, limit: number = 10): Promise<{
    users: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    
    // Cache the paginated results
    const cacheKey = CacheKeyGenerator.forPagination('user', page, limit);
    
    const result = await this.cacheService.readThrough(
      cacheKey,
      async () => {
        const [users, total] = await this.userRepository.findAndCount({
          skip,
          take: limit,
          relations: ['roles'],
          order: { createdAt: 'DESC' }
        });
        
        return {
          users,
          total,
          page,
          totalPages: Math.ceil(total / limit)
        };
      },
      600 // 10 minutes TTL
    );
    
    return result || { users: [], total: 0, page, totalPages: 0 };
  }
  
  /**
   * Bulk create users with cache warming
   */
  async bulkCreateUsers(usersData: Array<{
    email: string;
    firstName: string;
    lastName: string;
  }>): Promise<User[]> {
    const users = usersData.map(data => {
      const user = new User();
      user.email = data.email;
      user.firstName = data.firstName;
      user.lastName = data.lastName;
      return user;
    });
    
    const savedUsers = await this.userRepository.save(users);
    
    // Warm cache with all new users
    await User.warmCache(savedUsers);
    
    return savedUsers;
  }
  
  /**
   * Invalidate all user caches
   */
  async invalidateUserCache(): Promise<void> {
    await User.invalidateCache();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    return this.cacheService.getStatistics();
  }
  
  /**
   * Example of using transaction with cache
   */
  async transferRole(fromUserId: number, toUserId: number, roleId: number): Promise<void> {
    await this.userRepository.manager.transaction(async manager => {
      const fromUser = await manager.findOne(User, {
        where: { id: fromUserId },
        relations: ['roles']
      });
      
      const toUser = await manager.findOne(User, {
        where: { id: toUserId },
        relations: ['roles']
      });
      
      const role = await manager.findOne(Role, { where: { id: roleId } });
      
      if (!fromUser || !toUser || !role) {
        throw new Error('Invalid user or role');
      }
      
      // Remove role from first user
      fromUser.roles = fromUser.roles.filter(r => r.id !== roleId);
      await manager.save(fromUser);
      
      // Add role to second user
      toUser.roles.push(role);
      await manager.save(toUser);
      
      // Invalidate cache for both users
      await this.cacheService.delete(CacheKeyGenerator.forEntity(fromUser));
      await this.cacheService.delete(CacheKeyGenerator.forEntity(toUser));
    });
  }
}