import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable } from 'typeorm';
import { CachedBaseEntity } from '../src';
import { CacheableEntity, CacheKey, PreloadCache } from '../src';

@Entity()
@CacheableEntity({
  ttl: 3600, // 1 hour
  prefix: 'user',
  cacheRelations: true,
  writeThrough: true
})
@PreloadCache({
  onStartup: true,
  relations: ['roles']
})
export class User extends CachedBaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;
  
  @Column()
  @CacheKey() // Use email as part of cache key
  email!: string;
  
  @Column()
  firstName!: string;
  
  @Column()
  lastName!: string;
  
  @Column({ default: true })
  isActive!: boolean;
  
  @ManyToMany(() => Role)
  @JoinTable()
  roles!: Role[];
  
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
  
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}

@Entity()
@CacheableEntity({
  ttl: 7200, // 2 hours
  prefix: 'role'
})
export class Role extends CachedBaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;
  
  @Column({ unique: true })
  @CacheKey()
  name!: string;
  
  @Column({ type: 'json', nullable: true })
  permissions!: string[];
}